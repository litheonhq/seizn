/**
 * M6: Answer Contract Test Script
 * Tests:
 * 1. Prompt building (system + user)
 * 2. Citation extraction (UUID regex)
 * 3. Contract verification logic
 * 4. Edge cases (no citations, unknown citations, full coverage)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local'), override: true });

// ============================================
// Answer Contract Functions (inline for testing)
// ============================================

function buildAnswerContractSystemPrompt(): string {
  return `You are a careful assistant. You MUST cite sources using chunk ids.`;
}

function buildAnswerContractUserPrompt(params: {
  question: string;
  context: { id: string; text: string }[];
}): string {
  const ctx = params.context
    .slice(0, 12)
    .map((c) => `[${c.id}] ${c.text}`)
    .join('\n\n')
    .slice(0, 16000);

  return `Answer the QUESTION using only the CONTEXT.

CONTEXT:
${ctx}

QUESTION:
${params.question}

REQUIREMENTS:
- Every non-trivial claim MUST include at least one citation in the form [<chunk_id>].
- If the context is insufficient, say so and cite nothing.

Return plain text (no JSON).`;
}

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

interface AnswerContractResult {
  ok: boolean;
  citations: string[];
  unknownCitations: string[];
  citedChunkCoverage: number;
  issues: string[];
}

function verifyAnswerContract(params: {
  answerText: string;
  availableChunkIds: string[];
}): AnswerContractResult {
  const issues: string[] = [];

  const found = (params.answerText.match(UUID_RE) ?? []).map((s) => s.toLowerCase());
  const citations = Array.from(new Set(found));

  if (citations.length === 0) {
    issues.push('No chunk-id citations found in the answer.');
  }

  const available = new Set(params.availableChunkIds.map((s) => s.toLowerCase()));
  const unknownCitations = citations.filter((c) => !available.has(c));

  if (unknownCitations.length > 0) {
    issues.push('Answer contains citations not present in retrieved context.');
  }

  const citedKnown = citations.filter((c) => available.has(c));
  const coverage = available.size > 0 ? citedKnown.length / available.size : 0;

  if (available.size > 0 && citedKnown.length === 0) {
    issues.push('Answer did not cite any of the provided chunks.');
  }

  return {
    ok: issues.length === 0,
    citations,
    unknownCitations,
    citedChunkCoverage: coverage,
    issues,
  };
}

// ============================================
// Test: Prompt Building
// ============================================

function testPromptBuilding(): boolean {
  console.log('📝 Testing Prompt Building\n');

  // Test system prompt
  const systemPrompt = buildAnswerContractSystemPrompt();
  const hasSystemPrompt = systemPrompt.includes('cite sources');
  console.log(`   ${hasSystemPrompt ? '✅' : '❌'} System prompt contains citation requirement`);

  // Test user prompt
  const testContext = [
    { id: '11111111-1111-1111-8111-111111111111', text: 'Machine learning is a subset of AI.' },
    { id: '22222222-2222-2222-8222-222222222222', text: 'Deep learning uses neural networks.' },
    { id: '33333333-3333-3333-8333-333333333333', text: 'RAG combines retrieval with generation.' },
  ];

  const userPrompt = buildAnswerContractUserPrompt({
    question: 'What is machine learning?',
    context: testContext,
  });

  const checks = [
    { name: 'Contains CONTEXT section', ok: userPrompt.includes('CONTEXT:') },
    { name: 'Contains QUESTION section', ok: userPrompt.includes('QUESTION:') },
    { name: 'Contains REQUIREMENTS section', ok: userPrompt.includes('REQUIREMENTS:') },
    { name: 'Contains first chunk ID', ok: userPrompt.includes('[11111111-1111-1111-8111-111111111111]') },
    { name: 'Contains the question', ok: userPrompt.includes('What is machine learning?') },
    { name: 'Mentions citation format', ok: userPrompt.includes('[<chunk_id>]') },
  ];

  let passed = hasSystemPrompt ? 1 : 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Prompt Building: ${passed}/${checks.length + 1} tests passed\n`);
  return passed === checks.length + 1;
}

// ============================================
// Test: Citation Extraction
// ============================================

function testCitationExtraction(): boolean {
  console.log('🔍 Testing Citation Extraction\n');

  const testCases = [
    {
      name: 'Single citation',
      text: 'Machine learning is powerful [11111111-1111-1111-8111-111111111111].',
      expectedCount: 1,
    },
    {
      name: 'Multiple citations',
      text: 'ML [11111111-1111-1111-8111-111111111111] and DL [22222222-2222-2222-8222-222222222222] are related.',
      expectedCount: 2,
    },
    {
      name: 'Duplicate citations (should dedupe)',
      text: 'See [11111111-1111-1111-8111-111111111111] and also [11111111-1111-1111-8111-111111111111] again.',
      expectedCount: 1,
    },
    {
      name: 'No citations',
      text: 'This answer has no citations at all.',
      expectedCount: 0,
    },
    {
      name: 'Invalid UUID (should not match)',
      text: 'This is not a UUID: [not-a-valid-uuid-here].',
      expectedCount: 0,
    },
    {
      name: 'Mixed valid and invalid',
      text: 'Valid [11111111-1111-1111-8111-111111111111] and invalid [123-456].',
      expectedCount: 1,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const found = (tc.text.match(UUID_RE) ?? []).map((s) => s.toLowerCase());
    const citations = Array.from(new Set(found));
    const ok = citations.length === tc.expectedCount;

    console.log(`   ${ok ? '✅' : '❌'} ${tc.name}: found ${citations.length} (expected ${tc.expectedCount})`);
    if (ok) passed++;
  }

  console.log(`\n📊 Citation Extraction: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: Contract Verification
// ============================================

function testContractVerification(): boolean {
  console.log('✔️ Testing Contract Verification\n');

  const CHUNK_A = '11111111-1111-1111-8111-111111111111';
  const CHUNK_B = '22222222-2222-2222-8222-222222222222';
  const CHUNK_C = '33333333-3333-3333-8333-333333333333';
  const UNKNOWN = '99999999-9999-4999-9999-999999999999';

  const testCases = [
    {
      name: 'Valid: All citations from available chunks',
      answer: `Machine learning [${CHUNK_A}] uses algorithms [${CHUNK_B}].`,
      available: [CHUNK_A, CHUNK_B, CHUNK_C],
      expectOk: true,
      expectCoverage: 2 / 3,
    },
    {
      name: 'Invalid: No citations',
      answer: 'Machine learning uses algorithms to learn from data.',
      available: [CHUNK_A, CHUNK_B],
      expectOk: false,
      expectCoverage: 0,
    },
    {
      name: 'Invalid: Unknown citation',
      answer: `Machine learning [${UNKNOWN}] is a field of AI.`,
      available: [CHUNK_A, CHUNK_B],
      expectOk: false,
      expectCoverage: 0,
    },
    {
      name: 'Invalid: Mix of valid and unknown',
      answer: `ML [${CHUNK_A}] and unknown [${UNKNOWN}] are mentioned.`,
      available: [CHUNK_A, CHUNK_B],
      expectOk: false,
      expectCoverage: 0.5,
    },
    {
      name: 'Valid: Full coverage',
      answer: `[${CHUNK_A}] and [${CHUNK_B}] cover everything.`,
      available: [CHUNK_A, CHUNK_B],
      expectOk: true,
      expectCoverage: 1,
    },
    {
      name: 'Edge: Empty available chunks',
      answer: `Some answer without context [${CHUNK_A}].`,
      available: [],
      expectOk: false, // Has citation but no available chunks
      expectCoverage: 0,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = verifyAnswerContract({
      answerText: tc.answer,
      availableChunkIds: tc.available,
    });

    const okMatch = result.ok === tc.expectOk;
    const coverageMatch = Math.abs(result.citedChunkCoverage - tc.expectCoverage) < 0.01;
    const allOk = okMatch && coverageMatch;

    console.log(
      `   ${allOk ? '✅' : '❌'} ${tc.name}: ok=${result.ok} (${tc.expectOk}), coverage=${result.citedChunkCoverage.toFixed(2)} (${tc.expectCoverage.toFixed(2)})`
    );

    if (!allOk) {
      console.log(`      Issues: ${result.issues.join(', ')}`);
    }

    if (allOk) passed++;
  }

  console.log(`\n📊 Contract Verification: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: E2E Simulation
// ============================================

function testE2ESimulation(): boolean {
  console.log('🚀 Testing E2E Simulation\n');

  // Simulate a full flow: build prompt → mock LLM response → verify contract
  const context = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      text: 'Machine learning (ML) is a type of artificial intelligence that allows computers to learn from data.',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      text: 'Supervised learning requires labeled training data to make predictions.',
    },
  ];

  // 1. Build prompt
  const systemPrompt = buildAnswerContractSystemPrompt();
  const userPrompt = buildAnswerContractUserPrompt({
    question: 'What is machine learning?',
    context,
  });

  console.log('   1. Built system prompt:', systemPrompt.length, 'chars');
  console.log('   2. Built user prompt:', userPrompt.length, 'chars');

  // 2. Simulate good LLM response (with proper citations)
  const goodResponse = `Machine learning is a type of artificial intelligence that enables computers to learn from data [aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa]. It includes approaches like supervised learning, which requires labeled data [bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb].`;

  const goodResult = verifyAnswerContract({
    answerText: goodResponse,
    availableChunkIds: context.map((c) => c.id),
  });

  console.log('   3. Good response verification:');
  console.log('      - ok:', goodResult.ok);
  console.log('      - citations:', goodResult.citations.length);
  console.log('      - coverage:', goodResult.citedChunkCoverage.toFixed(2));

  // 3. Simulate bad LLM response (no citations)
  const badResponse = `Machine learning is a subset of AI that learns from data. It includes supervised and unsupervised learning approaches.`;

  const badResult = verifyAnswerContract({
    answerText: badResponse,
    availableChunkIds: context.map((c) => c.id),
  });

  console.log('   4. Bad response verification:');
  console.log('      - ok:', badResult.ok);
  console.log('      - issues:', badResult.issues.join(', '));

  // Verify expectations
  const checks = [
    { name: 'Good response is valid', ok: goodResult.ok === true },
    { name: 'Good response has full coverage', ok: goodResult.citedChunkCoverage === 1 },
    { name: 'Bad response is invalid', ok: badResult.ok === false },
    { name: 'Bad response has no citations issue', ok: badResult.issues.length > 0 },
  ];

  let passed = 0;
  console.log('\n   Checks:');
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 E2E Simulation: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Context Truncation
// ============================================

function testContextTruncation(): boolean {
  console.log('✂️ Testing Context Truncation\n');

  // Create context that exceeds limits
  const manyChunks = Array.from({ length: 20 }, (_, i) => ({
    id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    text: `This is chunk number ${i} with some content that adds to the total length.`,
  }));

  const prompt = buildAnswerContractUserPrompt({
    question: 'Test question',
    context: manyChunks,
  });

  // Check that only first 12 chunks are included
  const includes12 = prompt.includes('[00000011-0000-4000-8000-000000000000]');
  const excludes13 = !prompt.includes('[00000012-0000-4000-8000-000000000000]');

  const checks = [
    { name: 'Includes 12th chunk (index 11)', ok: includes12 },
    { name: 'Excludes 13th chunk (index 12)', ok: excludes13 },
    { name: 'Prompt length under 20KB', ok: prompt.length < 20000 },
  ];

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Context Truncation: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 M6: Answer Contract Test\n');
  console.log('═'.repeat(50));

  try {
    // Test 1: Prompt Building
    const promptPassed = testPromptBuilding();

    // Test 2: Citation Extraction
    console.log('═'.repeat(50));
    const citationPassed = testCitationExtraction();

    // Test 3: Contract Verification
    console.log('═'.repeat(50));
    const verifyPassed = testContractVerification();

    // Test 4: E2E Simulation
    console.log('═'.repeat(50));
    const e2ePassed = testE2ESimulation();

    // Test 5: Context Truncation
    console.log('═'.repeat(50));
    const truncationPassed = testContextTruncation();

    // Summary
    console.log('═'.repeat(50));
    console.log('📊 M6 Test Summary:');
    console.log(`   - Prompt Building: ${promptPassed ? '✅' : '❌'}`);
    console.log(`   - Citation Extraction: ${citationPassed ? '✅' : '❌'}`);
    console.log(`   - Contract Verification: ${verifyPassed ? '✅' : '❌'}`);
    console.log(`   - E2E Simulation: ${e2ePassed ? '✅' : '❌'}`);
    console.log(`   - Context Truncation: ${truncationPassed ? '✅' : '❌'}`);

    const allPassed = promptPassed && citationPassed && verifyPassed && e2ePassed && truncationPassed;

    if (allPassed) {
      console.log('\n✅ M6 Answer Contract Test PASSED');
    } else {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
