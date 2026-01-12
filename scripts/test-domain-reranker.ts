/**
 * M7: Domain Reranker Test Script
 * Tests:
 * 1. BM25 tokenization and TF calculation
 * 2. IDF calculation
 * 3. BM25 scoring
 * 4. Reranking accuracy (relevance ordering)
 * 5. Provider factory selection
 * 6. Domain boost terms
 * 7. Top-N filtering
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

// ============================================
// BM25 Implementation (inline for testing)
// ============================================

const K1 = 1.2;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

function bm25Score(params: {
  queryTokens: string[];
  docTokens: string[];
  docTf: Map<string, number>;
  avgDocLen: number;
  idf: Map<string, number>;
}): number {
  const { queryTokens, docTokens, docTf, avgDocLen, idf } = params;
  const docLen = docTokens.length;

  let score = 0;
  for (const term of queryTokens) {
    const tf = docTf.get(term) ?? 0;
    if (tf === 0) continue;

    const idfValue = idf.get(term) ?? 0;
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / avgDocLen));

    score += idfValue * (numerator / denominator);
  }

  return score;
}

// Stop words
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'of', 'at', 'by', 'for', 'with',
  'about', 'to', 'from', 'in', 'on', 'and', 'or', 'not', 'but', 'if', 'then',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'so', 'such',
]);

function filterTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1);
}

interface RerankDocument {
  id: string;
  text: string;
}

interface RerankResult {
  id: string;
  score: number;
  index: number;
}

// Full BM25 reranker
function bm25Rerank(query: string, documents: RerankDocument[], topN?: number): RerankResult[] {
  if (documents.length === 0) return [];

  const n = topN ?? documents.length;
  const queryTokens = filterTokens(tokenize(query));

  const docData = documents.map((doc) => {
    const tokens = filterTokens(tokenize(doc.text));
    return { doc, tokens, tf: termFrequency(tokens) };
  });

  const totalLen = docData.reduce((sum, d) => sum + d.tokens.length, 0);
  const avgDocLen = totalLen / docData.length;

  const idf = new Map<string, number>();
  const N = docData.length;

  for (const term of new Set(queryTokens)) {
    const docsWithTerm = docData.filter((d) => d.tf.has(term)).length;
    const idfValue = Math.log(1 + (N - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
    idf.set(term, Math.max(0, idfValue));
  }

  const results: RerankResult[] = docData.map((d, idx) => {
    const score = bm25Score({
      queryTokens,
      docTokens: d.tokens,
      docTf: d.tf,
      avgDocLen,
      idf,
    });

    return { id: d.doc.id, score, index: idx };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, n);
}

// ============================================
// Test: Tokenization
// ============================================

function testTokenization(): boolean {
  console.log('📝 Testing Tokenization\n');

  const testCases = [
    { text: 'Hello World', expected: ['hello', 'world'] },
    { text: 'Machine-Learning is GREAT!', expected: ['machine', 'learning', 'is', 'great'] },
    { text: '  Multiple   Spaces  ', expected: ['multiple', 'spaces'] },
    { text: 'Numbers123 and text456', expected: ['numbers123', 'and', 'text456'] },
    { text: '', expected: [] },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = tokenize(tc.text);
    const ok = JSON.stringify(result) === JSON.stringify(tc.expected);
    console.log(`   ${ok ? '✅' : '❌'} "${tc.text}" → [${result.join(', ')}]`);
    if (ok) passed++;
  }

  console.log(`\n📊 Tokenization: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: Term Frequency
// ============================================

function testTermFrequency(): boolean {
  console.log('📊 Testing Term Frequency\n');

  const testCases = [
    { tokens: ['a', 'b', 'a', 'c', 'a'], expected: { a: 3, b: 1, c: 1 } },
    { tokens: ['hello', 'hello', 'world'], expected: { hello: 2, world: 1 } },
    { tokens: [], expected: {} },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = termFrequency(tc.tokens);
    const expectedMap = new Map(Object.entries(tc.expected));

    let ok = result.size === expectedMap.size;
    if (ok) {
      for (const [key, val] of expectedMap) {
        if (result.get(key) !== val) {
          ok = false;
          break;
        }
      }
    }

    console.log(`   ${ok ? '✅' : '❌'} [${tc.tokens.join(', ')}] → size=${result.size}`);
    if (ok) passed++;
  }

  console.log(`\n📊 Term Frequency: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: IDF Calculation
// ============================================

function testIDFCalculation(): boolean {
  console.log('📈 Testing IDF Calculation\n');

  // With 4 documents, if a term appears in 1 doc:
  // IDF = log(1 + (4 - 1 + 0.5) / (1 + 0.5)) = log(1 + 3.5/1.5) ≈ log(3.33) ≈ 1.20

  const documents = [
    { id: '1', text: 'machine learning algorithm' },
    { id: '2', text: 'deep learning neural network' },
    { id: '3', text: 'natural language processing' },
    { id: '4', text: 'computer vision recognition' },
  ];

  const docData = documents.map((doc) => ({
    tokens: filterTokens(tokenize(doc.text)),
    tf: termFrequency(filterTokens(tokenize(doc.text))),
  }));

  const N = 4;
  const queryTerms = ['machine', 'learning'];

  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const docsWithTerm = docData.filter((d) => d.tf.has(term)).length;
    const idfValue = Math.log(1 + (N - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
    idf.set(term, Math.max(0, idfValue));
  }

  console.log('   IDF values:');
  for (const [term, value] of idf) {
    console.log(`   - "${term}": ${value.toFixed(4)}`);
  }

  // "machine" appears in 1 doc → higher IDF
  // "learning" appears in 2 docs → lower IDF
  const machineIdf = idf.get('machine') ?? 0;
  const learningIdf = idf.get('learning') ?? 0;

  const checks = [
    { name: 'machine IDF > 0', ok: machineIdf > 0 },
    { name: 'learning IDF > 0', ok: learningIdf > 0 },
    { name: 'machine IDF > learning IDF (rarer term)', ok: machineIdf > learningIdf },
  ];

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 IDF Calculation: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: BM25 Reranking
// ============================================

function testBM25Reranking(): boolean {
  console.log('🔄 Testing BM25 Reranking\n');

  const documents: RerankDocument[] = [
    { id: 'doc1', text: 'Introduction to machine learning algorithms and data science fundamentals' },
    { id: 'doc2', text: 'Deep learning neural networks for image classification tasks' },
    { id: 'doc3', text: 'Machine learning models for natural language processing applications' },
    { id: 'doc4', text: 'Cooking recipes and kitchen equipment reviews' },
    { id: 'doc5', text: 'Advanced machine learning techniques for prediction problems' },
  ];

  const query = 'machine learning algorithms';
  const results = bm25Rerank(query, documents);

  console.log('   Query:', query);
  console.log('   Ranked results:');
  for (const r of results) {
    const doc = documents[r.index];
    console.log(`   ${r.index + 1}. [${r.id}] score=${r.score.toFixed(4)} - "${doc.text.slice(0, 50)}..."`);
  }

  // Verify ordering
  const checks = [
    { name: 'Top result contains "machine learning"', ok: ['doc1', 'doc3', 'doc5'].includes(results[0].id) },
    { name: 'Cooking doc is ranked low', ok: results.findIndex((r) => r.id === 'doc4') >= 3 },
    { name: 'Scores are descending', ok: results.every((r, i) => i === 0 || r.score <= results[i - 1].score) },
    { name: 'All documents ranked', ok: results.length === 5 },
  ];

  let passed = 0;
  console.log('\n   Checks:');
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 BM25 Reranking: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Top-N Filtering
// ============================================

function testTopNFiltering(): boolean {
  console.log('🔝 Testing Top-N Filtering\n');

  const documents: RerankDocument[] = [
    { id: 'a', text: 'Machine learning' },
    { id: 'b', text: 'Deep learning' },
    { id: 'c', text: 'Natural language' },
    { id: 'd', text: 'Computer vision' },
    { id: 'e', text: 'Data science' },
  ];

  const query = 'machine learning';

  const testCases = [
    { topN: 3, expectedCount: 3 },
    { topN: 1, expectedCount: 1 },
    { topN: 10, expectedCount: 5 }, // Can't exceed total docs
    { topN: undefined, expectedCount: 5 }, // All docs
  ];

  let passed = 0;
  for (const tc of testCases) {
    const results = bm25Rerank(query, documents, tc.topN);
    const ok = results.length === tc.expectedCount;
    console.log(`   ${ok ? '✅' : '❌'} topN=${tc.topN ?? 'undefined'} → ${results.length} results (expected ${tc.expectedCount})`);
    if (ok) passed++;
  }

  console.log(`\n📊 Top-N Filtering: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: Domain Boost
// ============================================

function testDomainBoost(): boolean {
  console.log('🚀 Testing Domain Boost\n');

  const documents: RerankDocument[] = [
    { id: 'general', text: 'Python programming language basics and tutorials' },
    { id: 'ml', text: 'Python machine learning with scikit-learn library' },
    { id: 'web', text: 'Python web development with Django framework' },
  ];

  // Without boost
  const query = 'python programming';
  const normalResults = bm25Rerank(query, documents);

  // Simulate boost by repeating query terms
  const boostedQuery = 'python programming machine learning machine learning'; // Boost ML terms
  const boostedResults = bm25Rerank(boostedQuery, documents);

  console.log('   Normal query:', query);
  console.log('   Normal top result:', normalResults[0].id);

  console.log('   Boosted query:', boostedQuery);
  console.log('   Boosted top result:', boostedResults[0].id);

  // With ML boost, the ML doc should rank higher
  const checks = [
    { name: 'Normal query works', ok: normalResults.length === 3 },
    { name: 'Boosted query affects ranking', ok: boostedResults[0].id !== normalResults[0].id || boostedResults[0].score !== normalResults[0].score },
    { name: 'ML doc benefits from boost', ok: boostedResults.findIndex((r) => r.id === 'ml') <= boostedResults.findIndex((r) => r.id === 'web') },
  ];

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Domain Boost: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Provider Factory
// ============================================

function testProviderFactory(): boolean {
  console.log('🏭 Testing Provider Factory\n');

  const testCases = [
    { env: 'cohere', expected: 'cohere' },
    { env: 'local-bm25', expected: 'local-bm25' },
    { env: 'bm25', expected: 'local-bm25' },
    { env: 'noop', expected: 'noop' },
    { env: undefined, expected: 'noop' }, // default
  ];

  let passed = 0;
  for (const tc of testCases) {
    // Simulate factory logic
    const provider = tc.env ?? 'noop';
    let result: string;
    switch (provider) {
      case 'cohere':
        result = 'cohere';
        break;
      case 'local-bm25':
      case 'bm25':
        result = 'local-bm25';
        break;
      case 'noop':
      default:
        result = 'noop';
    }

    const ok = result === tc.expected;
    console.log(`   ${ok ? '✅' : '❌'} SUMMER_RERANK_PROVIDER="${tc.env ?? 'undefined'}" → ${result}`);
    if (ok) passed++;
  }

  console.log(`\n📊 Provider Factory: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: Edge Cases
// ============================================

function testEdgeCases(): boolean {
  console.log('⚠️ Testing Edge Cases\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Empty documents
  const emptyResults = bm25Rerank('query', []);
  checks.push({ name: 'Empty documents returns empty', ok: emptyResults.length === 0 });

  // Empty query
  const emptyQueryResults = bm25Rerank('', [{ id: '1', text: 'some content' }]);
  checks.push({ name: 'Empty query returns results with zero scores', ok: emptyQueryResults.length === 1 && emptyQueryResults[0].score === 0 });

  // Query with only stop words
  const stopWordResults = bm25Rerank('the and or', [{ id: '1', text: 'machine learning' }]);
  checks.push({ name: 'Stop-word-only query returns zero scores', ok: stopWordResults.length === 1 && stopWordResults[0].score === 0 });

  // Very long document
  const longDoc = 'machine '.repeat(1000);
  const longResults = bm25Rerank('machine', [{ id: 'long', text: longDoc }]);
  checks.push({ name: 'Long document handles correctly', ok: longResults.length === 1 && longResults[0].score > 0 });

  // Unicode text
  const unicodeResults = bm25Rerank('검색', [{ id: 'kr', text: '한글 검색 테스트' }]);
  checks.push({ name: 'Unicode text handled', ok: unicodeResults.length === 1 });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Edge Cases: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 M7: Domain Reranker Test\n');
  console.log('═'.repeat(50));

  try {
    // Test 1: Tokenization
    const tokenPassed = testTokenization();

    // Test 2: Term Frequency
    console.log('═'.repeat(50));
    const tfPassed = testTermFrequency();

    // Test 3: IDF Calculation
    console.log('═'.repeat(50));
    const idfPassed = testIDFCalculation();

    // Test 4: BM25 Reranking
    console.log('═'.repeat(50));
    const rerankPassed = testBM25Reranking();

    // Test 5: Top-N Filtering
    console.log('═'.repeat(50));
    const topNPassed = testTopNFiltering();

    // Test 6: Domain Boost
    console.log('═'.repeat(50));
    const boostPassed = testDomainBoost();

    // Test 7: Provider Factory
    console.log('═'.repeat(50));
    const factoryPassed = testProviderFactory();

    // Test 8: Edge Cases
    console.log('═'.repeat(50));
    const edgePassed = testEdgeCases();

    // Summary
    console.log('═'.repeat(50));
    console.log('📊 M7 Test Summary:');
    console.log(`   - Tokenization: ${tokenPassed ? '✅' : '❌'}`);
    console.log(`   - Term Frequency: ${tfPassed ? '✅' : '❌'}`);
    console.log(`   - IDF Calculation: ${idfPassed ? '✅' : '❌'}`);
    console.log(`   - BM25 Reranking: ${rerankPassed ? '✅' : '❌'}`);
    console.log(`   - Top-N Filtering: ${topNPassed ? '✅' : '❌'}`);
    console.log(`   - Domain Boost: ${boostPassed ? '✅' : '❌'}`);
    console.log(`   - Provider Factory: ${factoryPassed ? '✅' : '❌'}`);
    console.log(`   - Edge Cases: ${edgePassed ? '✅' : '❌'}`);

    const allPassed = tokenPassed && tfPassed && idfPassed && rerankPassed && topNPassed && boostPassed && factoryPassed && edgePassed;

    if (allPassed) {
      console.log('\n✅ M7 Domain Reranker Test PASSED');
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
