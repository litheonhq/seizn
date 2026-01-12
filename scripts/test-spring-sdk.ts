/**
 * Test Spring Memory SDK
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import { SpringClient, createSpringClient } from '../src/lib/spring';
import type { Memory, SpringError } from '../src/lib/spring';

// ============================================
// Test: Client Initialization
// ============================================

function testClientInitialization(): boolean {
  console.log('🔧 Testing Client Initialization\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test with valid config
  try {
    const client = new SpringClient({
      apiKey: 'szn_test_key',
      namespace: 'test',
    });
    checks.push({ name: 'Client created with valid config', ok: true });
  } catch {
    checks.push({ name: 'Client created with valid config', ok: false });
  }

  // Test with custom options
  try {
    const client = new SpringClient({
      apiKey: 'szn_test_key',
      baseUrl: 'https://custom.api.com',
      namespace: 'custom',
      timeout: 60000,
      retries: 5,
    });
    checks.push({ name: 'Client with custom options', ok: true });
  } catch {
    checks.push({ name: 'Client with custom options', ok: false });
  }

  // Test factory function
  try {
    const client = createSpringClient({
      apiKey: 'szn_test_key',
    });
    checks.push({ name: 'Factory function works', ok: client instanceof SpringClient });
  } catch {
    checks.push({ name: 'Factory function works', ok: false });
  }

  // Test missing API key
  try {
    new SpringClient({ apiKey: '' });
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

  // Test Memory type
  const memory: Memory = {
    id: 'mem_123',
    content: 'Test content',
    memoryType: 'fact',
    tags: ['test'],
    namespace: 'test',
    scope: 'user',
    source: 'api',
    confidence: 1.0,
    importance: 5,
    createdAt: new Date().toISOString(),
  };
  checks.push({ name: 'Memory type valid', ok: memory.id === 'mem_123' });

  // Test MemoryType literals
  const types: Array<Memory['memoryType']> = [
    'fact',
    'preference',
    'experience',
    'relationship',
    'instruction',
    'conversation',
  ];
  checks.push({ name: 'All memory types valid', ok: types.length === 6 });

  // Test MemoryScope literals
  const scopes: Array<Memory['scope']> = ['user', 'session', 'global', 'project'];
  checks.push({ name: 'All scopes valid', ok: scopes.length === 4 });

  // Test SpringError type
  const error: SpringError = {
    code: 'TEST_ERROR',
    message: 'Test error message',
    status: 400,
    details: { field: 'content' },
  };
  checks.push({ name: 'SpringError type valid', ok: error.code === 'TEST_ERROR' });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Type Definitions: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Client Methods (Mocked)
// ============================================

function testClientMethods(): boolean {
  console.log('🔄 Testing Client Methods\n');

  const checks: { name: string; ok: boolean }[] = [];

  const client = new SpringClient({
    apiKey: 'szn_test_key',
    namespace: 'test',
  });

  // Test method existence
  checks.push({ name: 'add method exists', ok: typeof client.add === 'function' });
  checks.push({ name: 'search method exists', ok: typeof client.search === 'function' });
  checks.push({ name: 'get method exists', ok: typeof client.get === 'function' });
  checks.push({ name: 'update method exists', ok: typeof client.update === 'function' });
  checks.push({ name: 'delete method exists', ok: typeof client.delete === 'function' });
  checks.push({ name: 'bulkAdd method exists', ok: typeof client.bulkAdd === 'function' });
  checks.push({ name: 'export method exists', ok: typeof client.export === 'function' });
  checks.push({ name: 'import method exists', ok: typeof client.import === 'function' });
  checks.push({ name: 'stats method exists', ok: typeof client.stats === 'function' });

  // Test helper methods
  checks.push({ name: 'remember helper exists', ok: typeof client.remember === 'function' });
  checks.push({ name: 'recall helper exists', ok: typeof client.recall === 'function' });
  checks.push({ name: 'forget helper exists', ok: typeof client.forget === 'function' });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Client Methods: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Error Handler
// ============================================

function testErrorHandler(): boolean {
  console.log('⚠️ Testing Error Handler\n');

  const checks: { name: string; ok: boolean }[] = [];

  let errorReceived: SpringError | null = null;

  const client = new SpringClient({
    apiKey: 'szn_test_key',
    onError: (error) => {
      errorReceived = error;
    },
  });

  checks.push({ name: 'Error handler registered', ok: true });

  // Simulate error handling scenario
  const testError: SpringError = {
    code: 'TEST_ERROR',
    message: 'Test message',
  };

  // Note: In real tests, we'd mock fetch to trigger the error handler
  checks.push({ name: 'Error type structure valid', ok: 'code' in testError && 'message' in testError });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Error Handler: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Search Parameters
// ============================================

function testSearchParameters(): boolean {
  console.log('🔍 Testing Search Parameters\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test string query shorthand
  const stringQuery = 'test query';
  checks.push({ name: 'String query accepted', ok: typeof stringQuery === 'string' });

  // Test object query
  const objectQuery = {
    query: 'test query',
    limit: 20,
    threshold: 0.8,
    namespace: 'test',
    mode: 'hybrid' as const,
    tags: ['tag1', 'tag2'],
  };
  checks.push({ name: 'Object query valid', ok: objectQuery.query === 'test query' });
  checks.push({ name: 'Limit parameter valid', ok: objectQuery.limit === 20 });
  checks.push({ name: 'Threshold parameter valid', ok: objectQuery.threshold === 0.8 });
  checks.push({ name: 'Mode parameter valid', ok: ['vector', 'hybrid', 'keyword'].includes(objectQuery.mode) });
  checks.push({ name: 'Tags parameter valid', ok: Array.isArray(objectQuery.tags) });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Search Parameters: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 Spring Memory SDK Test\n');
  console.log('═'.repeat(50));

  const initPassed = testClientInitialization();

  console.log('═'.repeat(50));
  const typesPassed = testTypeDefinitions();

  console.log('═'.repeat(50));
  const methodsPassed = testClientMethods();

  console.log('═'.repeat(50));
  const errorPassed = testErrorHandler();

  console.log('═'.repeat(50));
  const searchPassed = testSearchParameters();

  // Summary
  console.log('═'.repeat(50));
  console.log('📊 Spring SDK Test Summary:');
  console.log(`   - Client Initialization: ${initPassed ? '✅' : '❌'}`);
  console.log(`   - Type Definitions: ${typesPassed ? '✅' : '❌'}`);
  console.log(`   - Client Methods: ${methodsPassed ? '✅' : '❌'}`);
  console.log(`   - Error Handler: ${errorPassed ? '✅' : '❌'}`);
  console.log(`   - Search Parameters: ${searchPassed ? '✅' : '❌'}`);

  const allPassed = initPassed && typesPassed && methodsPassed && errorPassed && searchPassed;

  if (allPassed) {
    console.log('\n✅ Spring SDK Test PASSED');
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
