/**
 * Prompt Templates for Test Generation
 *
 * LLM prompts for generating retrieval test cases from documents
 */

import type { TestType } from './types';

// ============================================
// System Prompts
// ============================================

export const TEST_GENERATION_SYSTEM_PROMPT = `You are an expert QA engineer specializing in RAG (Retrieval-Augmented Generation) system testing. Your task is to generate high-quality test cases that thoroughly evaluate a document retrieval system.

## Guidelines

1. **Test Coverage**: Generate diverse questions covering different aspects of the document
2. **Realistic Questions**: Mimic how real users would phrase their queries
3. **Varied Difficulty**: Include simple, moderate, and challenging questions
4. **Specificity**: Be specific about expected keywords and scoring thresholds

## Output Format
Always output valid JSON arrays. No markdown, no explanation, just the JSON.`;

// ============================================
// Test Type-Specific Prompts
// ============================================

export const POSITIVE_TEST_PROMPT = `Generate {{count}} positive test cases for the following document. These tests should have answers that CAN be found in the document.

**Document:**
{{content}}

**Requirements:**
- Questions should be answerable from the document content
- Include key information extraction questions
- Include questions about specific details, dates, numbers
- Include summarization-style questions
- Vary question complexity

**Output format (JSON array):**
[
  {
    "query": "User question that should be answerable",
    "test_type": "positive",
    "expected_keywords": ["key", "words", "from", "answer"],
    "min_score": 0.75,
    "notes": "What this tests"
  }
]

Generate exactly {{count}} test cases:`;

export const NEGATIVE_TEST_PROMPT = `Generate {{count}} negative test cases for the following document. These tests should have questions that CANNOT be answered from this document alone.

**Document:**
{{content}}

**Requirements:**
- Questions should be topically related but unanswerable
- Test the system's ability to recognize missing information
- Include questions about:
  - Future events not covered
  - Details not mentioned
  - Related topics not discussed
  - Comparisons with undiscussed items

**Output format (JSON array):**
[
  {
    "query": "Question that cannot be answered from this document",
    "test_type": "negative",
    "expected_not_keywords": ["keywords", "that", "should", "not", "appear"],
    "notes": "Why this can't be answered"
  }
]

Generate exactly {{count}} test cases:`;

export const EDGE_CASE_TEST_PROMPT = `Generate {{count}} edge case test cases for the following document. These tests should probe the boundaries of the retrieval system.

**Document:**
{{content}}

**Requirements:**
Include the following types of edge cases:
1. **Paraphrased queries**: Same meaning, different wording
2. **Synonym substitution**: Replace key terms with synonyms
3. **Negation tests**: "What is NOT..." or "Which ones don't..."
4. **Partial match tests**: Questions where only part of the answer exists
5. **Ambiguous queries**: Questions that could be interpreted multiple ways
6. **Typo-like queries**: Minor variations in key terms
7. **Cross-reference tests**: Questions requiring connecting multiple parts

**Output format (JSON array):**
[
  {
    "query": "Edge case query",
    "test_type": "edge_case",
    "expected_keywords": ["expected", "terms"],
    "min_score": 0.65,
    "notes": "Type of edge case and what it tests"
  }
]

Generate exactly {{count}} test cases:`;

// ============================================
// Multi-Document Prompts
// ============================================

export const MULTI_DOC_TEST_PROMPT = `Generate {{count}} test cases that require information from multiple documents to answer completely.

**Documents:**
{{documents}}

**Requirements:**
- Questions should need information from 2+ documents
- Test cross-document synthesis
- Include comparison questions
- Include aggregation questions (combining facts from multiple sources)

**Output format (JSON array):**
[
  {
    "query": "Question requiring multiple documents",
    "test_type": "positive",
    "expected_doc_ids": ["doc_id_1", "doc_id_2"],
    "expected_keywords": ["combined", "keywords"],
    "min_score": 0.7,
    "notes": "Why multiple docs are needed"
  }
]

Generate exactly {{count}} test cases:`;

// ============================================
// Specialized Prompts
// ============================================

export const FACTUAL_ACCURACY_PROMPT = `Generate {{count}} factual accuracy test cases. These tests should verify that the system retrieves and returns accurate information.

**Document:**
{{content}}

**Focus on:**
- Specific numbers, dates, statistics
- Named entities (people, organizations, places)
- Technical specifications
- Quoted statements
- Definitions

**Output format (JSON array):**
[
  {
    "query": "Question about a specific fact",
    "test_type": "positive",
    "expected_keywords": ["exact", "fact", "values"],
    "min_score": 0.85,
    "notes": "The exact fact being tested"
  }
]

Generate exactly {{count}} test cases:`;

export const TEMPORAL_TEST_PROMPT = `Generate {{count}} temporal reasoning test cases if the document contains time-sensitive information.

**Document:**
{{content}}

**Focus on:**
- "When did X happen?"
- "What happened before/after Y?"
- "What was the timeline of Z?"
- Sequence of events
- Duration-based questions

**Output format (JSON array):**
[
  {
    "query": "Time-related question",
    "test_type": "positive",
    "expected_keywords": ["temporal", "keywords"],
    "min_score": 0.75,
    "notes": "Temporal aspect being tested"
  }
]

If no temporal information exists, return: []

Generate test cases:`;

// ============================================
// Helper Functions
// ============================================

/**
 * Get the appropriate prompt template for a test type
 */
export function getPromptForTestType(testType: TestType): string {
  switch (testType) {
    case 'positive':
      return POSITIVE_TEST_PROMPT;
    case 'negative':
      return NEGATIVE_TEST_PROMPT;
    case 'edge_case':
      return EDGE_CASE_TEST_PROMPT;
    default:
      return POSITIVE_TEST_PROMPT;
  }
}

/**
 * Fill template variables
 */
export function fillTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  return result;
}

/**
 * Build document context for prompts
 */
export function buildDocumentContext(
  docs: Array<{ id: string; content: string; title?: string }>
): string {
  return docs
    .map((doc, index) => {
      const header = doc.title
        ? `### Document ${index + 1}: ${doc.title} (ID: ${doc.id})`
        : `### Document ${index + 1} (ID: ${doc.id})`;
      return `${header}\n${doc.content.slice(0, 3000)}${doc.content.length > 3000 ? '...' : ''}`;
    })
    .join('\n\n---\n\n');
}

// ============================================
// Validation Prompt
// ============================================

export const TEST_VALIDATION_PROMPT = `Review and validate the following test cases for a retrieval system. Identify any issues:

**Test Cases:**
{{test_cases}}

**Check for:**
1. Ambiguous or unclear queries
2. Missing or incorrect expected keywords
3. Unreasonable score thresholds
4. Duplicate or near-duplicate tests
5. Tests that don't match their stated type

**Output format (JSON):**
{
  "valid": true/false,
  "issues": [
    {
      "index": 0,
      "issue": "Description of the problem",
      "suggestion": "How to fix it"
    }
  ],
  "improvements": [
    {
      "index": 0,
      "improved_test": { ... }
    }
  ]
}`;

// ============================================
// Answer Generation Quality Prompts
// ============================================

export const FAITHFULNESS_CHECK_PROMPT = `Given the retrieved documents and generated answer, evaluate faithfulness.

**Retrieved Documents:**
{{documents}}

**Generated Answer:**
{{answer}}

**Query:**
{{query}}

**Evaluate:**
1. Is every claim in the answer supported by the documents? (0-1)
2. Are there any hallucinated facts? List them.
3. Is information correctly attributed?

**Output format (JSON):**
{
  "faithfulness_score": 0.95,
  "hallucinations": ["list of unsupported claims"],
  "unsupported_claims": ["specific unsupported statements"],
  "notes": "Additional observations"
}`;
