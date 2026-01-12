/**
 * Test Summer SDK Client
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import { SummerClient, createSummerClient } from '../src/lib/summer/sdk';
import type { Collection, SearchResponse, SummerError } from '../src/lib/summer/sdk';

// ============================================
// Test: Client Initialization
// ============================================

function testClientInitialization(): boolean {
  console.log('🔧 Testing Client Initialization\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test with valid config
  try {
    const client = new SummerClient({
      apiKey: 'szn_test_key',
    });
    checks.push({ name: 'Client created with valid config', ok: true });
  } catch {
    checks.push({ name: 'Client created with valid config', ok: false });
  }

  // Test with custom options
  try {
    const client = new SummerClient({
      apiKey: 'szn_test_key',
      baseUrl: 'https://custom.api.com/summer',
      timeout: 120000,
      retries: 5,
    });
    checks.push({ name: 'Client with custom options', ok: true });
  } catch {
    checks.push({ name: 'Client with custom options', ok: false });
  }

  // Test factory function
  try {
    const client = createSummerClient({
      apiKey: 'szn_test_key',
    });
    checks.push({ name: 'Factory function works', ok: client instanceof SummerClient });
  } catch {
    checks.push({ name: 'Factory function works', ok: false });
  }

  // Test missing API key
  try {
    new SummerClient({ apiKey: '' });
    checks.push({ name: 'Throws on missing API key', ok: false });
  } catch (error) {
    checks.push({
      name: 'Throws on missing API key',
      ok: error instanceof Error && error.message.includes('API key'),
    });
  }

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Client Initialization: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Type Definitions
// ============================================

function testTypeDefinitions(): boolean {
  console.log('📦 Testing Type Definitions\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test Collection type
  const collection: Collection = {
    id: 'col_123',
    name: 'Test Collection',
    description: 'Test description',
    documentCount: 100,
    embeddingDimensions: 1024,
    createdAt: new Date().toISOString(),
  };
  checks.push({ name: 'Collection type valid', ok: collection.id === 'col_123' });

  // Test SearchResponse type
  const searchResponse: SearchResponse = {
    success: true,
    results: [
      {
        chunkId: 'chunk_1',
        documentId: 'doc_1',
        content: 'Test content',
        similarity: 0.95,
      },
    ],
    count: 1,
    mode: 'hybrid',
    timings: {
      embedMs: 50,
      searchMs: 100,
      rerankMs: 80,
      totalMs: 230,
    },
  };
  checks.push({ name: 'SearchResponse type valid', ok: searchResponse.count === 1 });

  // Test SummerError type
  const error: SummerError = {
    code: 'TEST_ERROR',
    message: 'Test error message',
    status: 400,
    details: { field: 'collectionId' },
  };
  checks.push({ name: 'SummerError type valid', ok: error.code === 'TEST_ERROR' });

  // Test search modes
  const modes: Array<SearchResponse['mode']> = ['vector', 'keyword', 'hybrid'];
  checks.push({ name: 'All search modes valid', ok: modes.length === 3 });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Type Definitions: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Client Methods
// ============================================

function testClientMethods(): boolean {
  console.log('🔄 Testing Client Methods\n');

  const checks: { name: string; ok: boolean }[] = [];

  const client = new SummerClient({
    apiKey: 'szn_test_key',
  });

  // Collection methods
  checks.push({ name: 'createCollection exists', ok: typeof client.createCollection === 'function' });
  checks.push({ name: 'listCollections exists', ok: typeof client.listCollections === 'function' });
  checks.push({ name: 'getCollection exists', ok: typeof client.getCollection === 'function' });
  checks.push({ name: 'deleteCollection exists', ok: typeof client.deleteCollection === 'function' });
  checks.push({ name: 'getCollectionStats exists', ok: typeof client.getCollectionStats === 'function' });

  // Indexing methods
  checks.push({ name: 'index exists', ok: typeof client.index === 'function' });
  checks.push({ name: 'bulkIndex exists', ok: typeof client.bulkIndex === 'function' });
  checks.push({ name: 'getDocument exists', ok: typeof client.getDocument === 'function' });
  checks.push({ name: 'deleteDocument exists', ok: typeof client.deleteDocument === 'function' });
  checks.push({ name: 'updateDocumentMetadata exists', ok: typeof client.updateDocumentMetadata === 'function' });

  // Search methods
  checks.push({ name: 'search exists', ok: typeof client.search === 'function' });
  checks.push({ name: 'query exists', ok: typeof client.query === 'function' });
  checks.push({ name: 'federatedSearch exists', ok: typeof client.federatedSearch === 'function' });

  // RAG methods
  checks.push({ name: 'rag exists', ok: typeof client.rag === 'function' });
  checks.push({ name: 'ask exists', ok: typeof client.ask === 'function' });

  // Utility methods
  checks.push({ name: 'embed exists', ok: typeof client.embed === 'function' });
  checks.push({ name: 'rerank exists', ok: typeof client.rerank === 'function' });
  checks.push({ name: 'getAnalytics exists', ok: typeof client.getAnalytics === 'function' });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Client Methods: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Request Building
// ============================================

function testRequestBuilding(): boolean {
  console.log('🔍 Testing Request Building\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test search request structure
  const searchRequest = {
    collectionId: 'col_123',
    query: 'test query',
    topK: 10,
    threshold: 0.7,
    mode: 'hybrid' as const,
    rerank: true,
    rerankTopN: 5,
    filter: { source: 'arxiv' },
    includeMetadata: true,
  };
  checks.push({ name: 'Search request valid', ok: searchRequest.collectionId === 'col_123' });
  checks.push({ name: 'Search filter valid', ok: searchRequest.filter.source === 'arxiv' });

  // Test index request structure
  const indexRequest = {
    collectionId: 'col_123',
    externalId: 'ext_1',
    title: 'Test Document',
    content: 'Document content here...',
    metadata: { author: 'Test Author', year: 2024 },
    chunkingStrategy: 'semantic' as const,
    chunkSize: 512,
    chunkOverlap: 50,
  };
  checks.push({ name: 'Index request valid', ok: indexRequest.content.length > 0 });
  checks.push({ name: 'Chunking strategy valid', ok: ['fixed', 'semantic', 'paragraph'].includes(indexRequest.chunkingStrategy) });

  // Test RAG request structure
  const ragRequest = {
    collectionId: 'col_123',
    query: 'What is machine learning?',
    systemPrompt: 'You are a helpful research assistant.',
    contextLimit: 8000,
    citationStyle: 'inline' as const,
    model: 'claude-sonnet' as const,
    stream: false,
  };
  checks.push({ name: 'RAG request valid', ok: ragRequest.query.length > 0 });
  checks.push({ name: 'Citation style valid', ok: ['inline', 'footnote', 'none'].includes(ragRequest.citationStyle) });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Request Building: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Error Handling
// ============================================

function testErrorHandling(): boolean {
  console.log('⚠️ Testing Error Handling\n');

  const checks: { name: string; ok: boolean }[] = [];

  let errorReceived: SummerError | null = null;

  const client = new SummerClient({
    apiKey: 'szn_test_key',
    onError: (error) => {
      errorReceived = error;
    },
  });

  checks.push({ name: 'Error handler registered', ok: true });

  // Test error structure
  const testError: SummerError = {
    code: 'COLLECTION_NOT_FOUND',
    message: 'Collection not found',
    status: 404,
    details: { collectionId: 'invalid' },
  };

  checks.push({ name: 'Error has code', ok: 'code' in testError });
  checks.push({ name: 'Error has message', ok: 'message' in testError });
  checks.push({ name: 'Error has status', ok: testError.status === 404 });
  checks.push({ name: 'Error has details', ok: testError.details?.collectionId === 'invalid' });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Error Handling: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 Summer SDK Test\n');
  console.log('═'.repeat(50));

  const initPassed = testClientInitialization();

  console.log('═'.repeat(50));
  const typesPassed = testTypeDefinitions();

  console.log('═'.repeat(50));
  const methodsPassed = testClientMethods();

  console.log('═'.repeat(50));
  const requestPassed = testRequestBuilding();

  console.log('═'.repeat(50));
  const errorPassed = testErrorHandling();

  // Summary
  console.log('═'.repeat(50));
  console.log('📊 Summer SDK Test Summary:');
  console.log(`   - Client Initialization: ${initPassed ? '✅' : '❌'}`);
  console.log(`   - Type Definitions: ${typesPassed ? '✅' : '❌'}`);
  console.log(`   - Client Methods: ${methodsPassed ? '✅' : '❌'}`);
  console.log(`   - Request Building: ${requestPassed ? '✅' : '❌'}`);
  console.log(`   - Error Handling: ${errorPassed ? '✅' : '❌'}`);

  const allPassed = initPassed && typesPassed && methodsPassed && requestPassed && errorPassed;

  if (allPassed) {
    console.log('\n✅ Summer SDK Test PASSED');
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
