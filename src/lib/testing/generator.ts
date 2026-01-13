/**
 * Test Generator
 *
 * Generates retrieval test cases from documents using LLM
 */

import {
  TEST_GENERATION_SYSTEM_PROMPT,
  getPromptForTestType,
  fillTemplate,
  buildDocumentContext,
  MULTI_DOC_TEST_PROMPT,
} from './prompts';
import type {
  GeneratedTest,
  GenerationOptions,
  TestType,
  TestCase,
} from './types';
import { createServerClient } from '../supabase';

// ============================================
// Constants
// ============================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_COUNT = 5;
const DEFAULT_TYPES: TestType[] = ['positive', 'negative', 'edge_case'];

// ============================================
// Main Generation Function
// ============================================

/**
 * Generate test cases from documents
 */
export async function generateTestsFromDocs(
  docs: Array<{ id: string; content: string; title?: string }>,
  options: GenerationOptions = {}
): Promise<GeneratedTest[]> {
  const {
    count = DEFAULT_COUNT,
    types = DEFAULT_TYPES,
    model = 'haiku',
  } = options;

  const allTests: GeneratedTest[] = [];

  // Calculate tests per type
  const testsPerType = Math.ceil(count / types.length);

  // Generate tests for each type
  for (const testType of types) {
    try {
      const tests = await generateTestsByType(docs, testType, testsPerType, model);
      allTests.push(...tests);
    } catch (error) {
      console.error(`Error generating ${testType} tests:`, error);
    }
  }

  // Trim to exact count if needed
  return allTests.slice(0, count);
}

/**
 * Generate tests of a specific type
 */
async function generateTestsByType(
  docs: Array<{ id: string; content: string; title?: string }>,
  testType: TestType,
  count: number,
  model: 'haiku' | 'sonnet'
): Promise<GeneratedTest[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Build document context
  const docContext =
    docs.length === 1
      ? docs[0].content.slice(0, 8000)
      : buildDocumentContext(docs);

  // Get and fill prompt template
  const promptTemplate = getPromptForTestType(testType);
  const prompt = fillTemplate(promptTemplate, {
    count,
    content: docContext,
  });

  const modelId =
    model === 'haiku'
      ? 'claude-3-5-haiku-20241022'
      : 'claude-3-5-sonnet-20241022';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: TEST_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Parse JSON response
  try {
    const tests = JSON.parse(text);
    return tests.map((test: GeneratedTest) => ({
      ...test,
      test_type: testType,
      expected_keywords: test.expected_keywords || [],
      expected_not_keywords: test.expected_not_keywords || [],
      min_score: test.min_score ?? (testType === 'positive' ? 0.75 : 0.5),
    }));
  } catch (parseError) {
    console.error('Failed to parse test generation response:', text);
    return [];
  }
}

/**
 * Generate tests for multi-document scenarios
 */
export async function generateMultiDocTests(
  docs: Array<{ id: string; content: string; title?: string }>,
  count: number = 5,
  model: 'haiku' | 'sonnet' = 'sonnet'
): Promise<GeneratedTest[]> {
  if (docs.length < 2) {
    throw new Error('Multi-doc tests require at least 2 documents');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const docContext = buildDocumentContext(docs);
  const prompt = fillTemplate(MULTI_DOC_TEST_PROMPT, {
    count,
    documents: docContext,
  });

  const modelId =
    model === 'haiku'
      ? 'claude-3-5-haiku-20241022'
      : 'claude-3-5-sonnet-20241022';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: TEST_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    console.error('Failed to parse multi-doc test response:', text);
    return [];
  }
}

/**
 * Generate tests using a custom template
 */
export async function generateTestsFromTemplate(
  templateId: string,
  docs: Array<{ id: string; content: string; title?: string }>,
  count: number = 5,
  model: 'haiku' | 'sonnet' = 'haiku'
): Promise<GeneratedTest[]> {
  const supabase = createServerClient();

  // Fetch template
  const { data: template, error } = await supabase
    .from('retrieval_test_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error || !template) {
    throw new Error('Template not found');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Build context
  const docContext =
    docs.length === 1
      ? docs[0].content.slice(0, 8000)
      : buildDocumentContext(docs);

  // Fill template
  const prompt = fillTemplate(template.prompt_template, {
    count,
    content: docContext,
    documents: docContext,
  });

  const modelId =
    model === 'haiku'
      ? 'claude-3-5-haiku-20241022'
      : 'claude-3-5-sonnet-20241022';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: TEST_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const tests = JSON.parse(text);
    return tests.map((test: GeneratedTest) => ({
      ...test,
      test_type: test.test_type || (template.template_type as TestType) || 'positive',
      expected_keywords: test.expected_keywords || [],
      expected_not_keywords: test.expected_not_keywords || [],
    }));
  } catch {
    console.error('Failed to parse template test response:', text);
    return [];
  }
}

// ============================================
// Database Operations
// ============================================

/**
 * Save generated tests to database
 */
export async function saveGeneratedTests(
  suiteId: string,
  tests: GeneratedTest[],
  sourceDocIds: string[] = []
): Promise<TestCase[]> {
  const supabase = createServerClient();

  const testCasesToInsert = tests.map((test) => ({
    suite_id: suiteId,
    name: test.notes || null,
    query: test.query,
    test_type: test.test_type,
    expected_doc_ids: test.expected_doc_ids || [],
    expected_keywords: test.expected_keywords,
    expected_not_keywords: test.expected_not_keywords || [],
    min_score: test.min_score || 0.7,
    max_latency_ms: 5000,
    generated_from_doc_id: sourceDocIds[0] || null,
    generation_context: test.notes || null,
    metadata: {},
  }));

  const { data, error } = await supabase
    .from('retrieval_test_cases')
    .insert(testCasesToInsert)
    .select();

  if (error) {
    throw new Error(`Failed to save test cases: ${error.message}`);
  }

  // Update suite's source_doc_ids
  if (sourceDocIds.length > 0) {
    await supabase
      .from('retrieval_test_suites')
      .update({
        source_doc_ids: sourceDocIds,
        generated_by: 'auto',
      })
      .eq('id', suiteId);
  }

  return data as TestCase[];
}

/**
 * Fetch documents for test generation
 */
export async function fetchDocumentsForGeneration(
  docIds: string[],
  userId: string
): Promise<Array<{ id: string; content: string; title?: string }>> {
  const supabase = createServerClient();

  // Try summer_documents table first (RAG documents)
  const { data: summerDocs, error: summerError } = await supabase
    .from('summer_documents')
    .select('id, content, title')
    .in('id', docIds)
    .eq('user_id', userId);

  if (!summerError && summerDocs && summerDocs.length > 0) {
    return summerDocs.map((doc) => ({
      id: doc.id,
      content: doc.content,
      title: doc.title,
    }));
  }

  // Fallback to memories table
  const { data: memories, error: memError } = await supabase
    .from('memories')
    .select('id, content')
    .in('id', docIds)
    .eq('user_id', userId);

  if (memError || !memories) {
    throw new Error('Failed to fetch documents for generation');
  }

  return memories.map((m) => ({
    id: m.id,
    content: m.content,
  }));
}

// ============================================
// Utility Functions
// ============================================

/**
 * Validate generated tests
 */
export function validateGeneratedTests(tests: GeneratedTest[]): {
  valid: GeneratedTest[];
  invalid: Array<{ test: GeneratedTest; reason: string }>;
} {
  const valid: GeneratedTest[] = [];
  const invalid: Array<{ test: GeneratedTest; reason: string }> = [];

  for (const test of tests) {
    // Check required fields
    if (!test.query || test.query.trim().length < 5) {
      invalid.push({ test, reason: 'Query too short or missing' });
      continue;
    }

    if (!test.test_type || !['positive', 'negative', 'edge_case'].includes(test.test_type)) {
      invalid.push({ test, reason: 'Invalid test type' });
      continue;
    }

    // Positive tests should have expected keywords
    if (test.test_type === 'positive' && (!test.expected_keywords || test.expected_keywords.length === 0)) {
      invalid.push({ test, reason: 'Positive test missing expected keywords' });
      continue;
    }

    valid.push(test);
  }

  return { valid, invalid };
}

/**
 * Deduplicate generated tests
 */
export function deduplicateTests(tests: GeneratedTest[]): GeneratedTest[] {
  const seen = new Set<string>();
  const unique: GeneratedTest[] = [];

  for (const test of tests) {
    // Normalize query for comparison
    const normalized = test.query.toLowerCase().trim();

    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(test);
    }
  }

  return unique;
}
