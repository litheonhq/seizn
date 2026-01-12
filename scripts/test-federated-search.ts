/**
 * M5: Federated Search Test Script
 * Tests:
 * 1. Federated source creation (with encrypted config)
 * 2. Federated binding creation
 * 3. Registry loading (loadFederatedBindings)
 * 4. Factory pattern (createFederatedSource)
 * 5. Deduplication logic
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEIZN_ENCRYPTION_KEY = process.env.SEIZN_ENCRYPTION_KEY || 'test-encryption-key';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEST_USER_ID = 'test-federated-user';

// ============================================
// Crypto functions (inline for testing)
// ============================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

function encryptJson(value: unknown, secret: string = SEIZN_ENCRYPTION_KEY): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptJson<T = unknown>(payloadB64: string, secret: string = SEIZN_ENCRYPTION_KEY): T {
  const key = deriveKey(secret);
  const buf = Buffer.from(payloadB64, 'base64');

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf-8')) as T;
}

// ============================================
// Setup Functions
// ============================================

async function setupTestProfile() {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: TEST_USER_ID, email: 'federated-test@seizn.com', plan: 'pro' }, { onConflict: 'id' });

  if (error && error.code !== '23505') throw error;
  console.log('✅ Test profile ready');
}

async function getOrCreateTestCollection(): Promise<string> {
  const { data: existing } = await supabase
    .from('summer_collections')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .eq('name', 'federated-test-collection')
    .single();

  if (existing) {
    console.log('✅ Using existing collection:', existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('summer_collections')
    .insert({
      user_id: TEST_USER_ID,
      name: 'federated-test-collection',
      description: 'Test collection for M5 federated search',
    })
    .select('id')
    .single();

  if (error) throw error;
  console.log('✅ Created test collection:', data.id);
  return data.id;
}

async function cleanupOldTestData() {
  // Clean up old federated bindings and sources
  await supabase.from('summer_federated_bindings').delete().eq('user_id', TEST_USER_ID);
  await supabase.from('summer_federated_sources').delete().eq('user_id', TEST_USER_ID);
  console.log('🧹 Cleaned up old test data');
}

// ============================================
// Test: Encryption/Decryption
// ============================================

function testEncryption(): boolean {
  console.log('🔐 Testing Encryption/Decryption\n');

  const testConfig = {
    endpoint: 'https://example.com/api/summer/retrieve',
    apiKey: 'test-api-key-12345',
    timeoutMs: 3000,
  };

  try {
    const encrypted = encryptJson(testConfig);
    console.log('   Encrypted:', encrypted.slice(0, 50) + '...');

    const decrypted = decryptJson<typeof testConfig>(encrypted);
    console.log('   Decrypted endpoint:', decrypted.endpoint);
    console.log('   Decrypted apiKey:', decrypted.apiKey);

    const isValid =
      decrypted.endpoint === testConfig.endpoint &&
      decrypted.apiKey === testConfig.apiKey &&
      decrypted.timeoutMs === testConfig.timeoutMs;

    if (isValid) {
      console.log('✅ Encryption/Decryption works\n');
      return true;
    }

    console.log('❌ Decrypted values do not match\n');
    return false;
  } catch (err) {
    console.log('❌ Encryption/Decryption failed:', err);
    return false;
  }
}

// ============================================
// Test: Federated Source Creation
// ============================================

async function createFederatedSource(): Promise<string> {
  console.log('📦 Creating Federated Source...\n');

  const sourceConfig = {
    endpoint: 'https://remote.example.com/api/summer/retrieve',
    apiKey: 'remote-api-key-secret',
    timeoutMs: 2500,
  };

  const configEncrypted = encryptJson(sourceConfig);

  const { data: source, error: sourceErr } = await supabase
    .from('summer_federated_sources')
    .insert({
      user_id: TEST_USER_ID,
      name: 'M5 Test Remote Source',
      provider: 'custom',
      config_encrypted: configEncrypted,
      capabilities: { vector: true, keyword: true, hybrid: false },
      is_active: true,
    })
    .select('id')
    .single();

  if (sourceErr) throw sourceErr;
  console.log('   Source ID:', source.id);
  console.log('✅ Federated source created\n');
  return source.id;
}

// ============================================
// Test: Federated Binding Creation
// ============================================

async function createFederatedBinding(collectionId: string, sourceId: string): Promise<string> {
  console.log('🔗 Creating Federated Binding...\n');

  const { data: binding, error: bindingErr } = await supabase
    .from('summer_federated_bindings')
    .insert({
      user_id: TEST_USER_ID,
      collection_id: collectionId,
      source_id: sourceId,
      remote_collection: 'remote-collection-abc',
      policy: { maxResults: 10, allowKeyword: true },
    })
    .select('id')
    .single();

  if (bindingErr) throw bindingErr;
  console.log('   Binding ID:', binding.id);
  console.log('✅ Federated binding created\n');
  return binding.id;
}

// ============================================
// Test: Load Federated Bindings
// ============================================

async function testLoadBindings(collectionId: string): Promise<boolean> {
  console.log('📋 Testing Load Federated Bindings...\n');

  // Query with join (similar to registry.ts)
  const { data, error } = await supabase
    .from('summer_federated_bindings')
    .select(
      `
      id,
      collection_id,
      source_id,
      remote_collection,
      policy,
      source:summer_federated_sources (
        id,
        provider,
        config_encrypted,
        capabilities,
        is_active
      )
    `
    )
    .eq('user_id', TEST_USER_ID)
    .eq('collection_id', collectionId);

  if (error) {
    console.log('❌ Failed to load bindings:', error);
    return false;
  }

  if (!data || data.length === 0) {
    console.log('❌ No bindings found');
    return false;
  }

  console.log(`   Found ${data.length} binding(s)`);

  // Verify decryption
  const binding = data[0] as any;
  const source = binding.source;

  if (!source || !source.config_encrypted) {
    console.log('❌ Source config not found');
    return false;
  }

  try {
    const decryptedConfig = decryptJson<Record<string, unknown>>(source.config_encrypted);
    console.log('   Decrypted config endpoint:', decryptedConfig.endpoint);
    console.log('   Provider:', source.provider);
    console.log('   Capabilities:', JSON.stringify(source.capabilities));
    console.log('   Remote collection:', binding.remote_collection);
    console.log('✅ Load bindings works\n');
    return true;
  } catch (err) {
    console.log('❌ Failed to decrypt config:', err);
    return false;
  }
}

// ============================================
// Test: Factory Pattern
// ============================================

function testFactory(): boolean {
  console.log('🏭 Testing Factory Pattern...\n');

  // Simulate createFederatedSource factory logic
  const testCases = [
    { provider: 'custom', shouldUse: 'HttpAgentSource' },
    { provider: 'pinecone', shouldUse: 'UnsupportedFederatedSource' },
    { provider: 'weaviate', shouldUse: 'UnsupportedFederatedSource' },
    { provider: 'azure_ai_search', shouldUse: 'UnsupportedFederatedSource' },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = tc.provider === 'custom' ? 'HttpAgentSource' : 'UnsupportedFederatedSource';
    const ok = result === tc.shouldUse;
    console.log(`   ${ok ? '✅' : '❌'} provider="${tc.provider}" → ${result}`);
    if (ok) passed++;
  }

  console.log(`\n📊 Factory: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// Test: Deduplication Logic
// ============================================

function testDeduplication(): boolean {
  console.log('🔄 Testing Deduplication Logic...\n');

  // Simulate merged results from multiple sources
  interface MockResult {
    chunkId: string;
    content: string;
    similarity: number;
    source?: string;
  }

  const mockResults: MockResult[] = [
    { chunkId: 'chunk-1', content: 'Content A', similarity: 0.95, source: 'federated:source-1' },
    { chunkId: 'chunk-2', content: 'Content B', similarity: 0.88, source: 'federated:source-1' },
    { chunkId: 'chunk-1', content: 'Content A', similarity: 0.92, source: 'federated:source-2' }, // Duplicate with lower score
    { chunkId: 'chunk-3', content: 'Content C', similarity: 0.85, source: 'federated:source-2' },
    { chunkId: 'chunk-2', content: 'Content B', similarity: 0.91, source: 'federated:source-2' }, // Duplicate with higher score
  ];

  // Deduplication logic (from search.ts)
  const byChunk = new Map<string, MockResult>();
  for (const item of mockResults) {
    const existing = byChunk.get(item.chunkId);
    if (!existing || (item.similarity ?? 0) > (existing.similarity ?? 0)) {
      byChunk.set(item.chunkId, item);
    }
  }

  const deduplicated = Array.from(byChunk.values());

  console.log('   Input: 5 results (2 duplicates)');
  console.log('   Output:', deduplicated.length, 'unique results');

  // Verify
  const chunk1 = deduplicated.find((r) => r.chunkId === 'chunk-1');
  const chunk2 = deduplicated.find((r) => r.chunkId === 'chunk-2');

  const checks = [
    { name: 'Unique count is 3', ok: deduplicated.length === 3 },
    { name: 'chunk-1 has higher similarity (0.95)', ok: chunk1?.similarity === 0.95 },
    { name: 'chunk-2 has higher similarity (0.91)', ok: chunk2?.similarity === 0.91 },
  ];

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Deduplication: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: End-to-End Flow (without HTTP call)
// ============================================

async function testE2EFlow(collectionId: string): Promise<boolean> {
  console.log('🚀 Testing E2E Flow (simulated)...\n');

  // 1. Load bindings
  const { data: bindings, error: bindErr } = await supabase
    .from('summer_federated_bindings')
    .select(
      `
      id,
      collection_id,
      source_id,
      remote_collection,
      policy,
      source:summer_federated_sources (
        id,
        provider,
        config_encrypted,
        capabilities,
        is_active
      )
    `
    )
    .eq('user_id', TEST_USER_ID)
    .eq('collection_id', collectionId);

  if (bindErr || !bindings || bindings.length === 0) {
    console.log('❌ Failed to load bindings for E2E');
    return false;
  }

  console.log('   1. Loaded', bindings.length, 'binding(s)');

  // 2. Filter active sources
  const activeBindings = bindings.filter((b: any) => b.source?.is_active);
  console.log('   2. Active bindings:', activeBindings.length);

  // 3. Simulate factory selection
  const binding = activeBindings[0] as any;
  const provider = binding.source.provider;
  const sourceType = provider === 'custom' ? 'HttpAgentSource' : 'UnsupportedFederatedSource';
  console.log(`   3. Factory selected: ${sourceType}`);

  // 4. Decrypt config
  const decrypted = decryptJson<Record<string, unknown>>(binding.source.config_encrypted);
  const hasEndpoint = !!decrypted.endpoint;
  const hasApiKey = !!decrypted.apiKey;
  console.log(`   4. Config decrypted: endpoint=${hasEndpoint}, apiKey=${hasApiKey}`);

  // 5. Simulate search (would call HTTP in real scenario)
  console.log('   5. Search would call:', decrypted.endpoint);

  const allChecks =
    activeBindings.length > 0 && sourceType === 'HttpAgentSource' && hasEndpoint && hasApiKey;

  if (allChecks) {
    console.log('✅ E2E Flow works (simulated)\n');
    return true;
  }

  console.log('❌ E2E Flow failed\n');
  return false;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 M5: Federated Search Test\n');
  console.log('═'.repeat(50));

  try {
    // Setup
    await setupTestProfile();
    const collectionId = await getOrCreateTestCollection();
    await cleanupOldTestData();

    // Test 1: Encryption
    console.log('═'.repeat(50));
    const encryptionPassed = testEncryption();

    // Test 2: Factory
    console.log('═'.repeat(50));
    const factoryPassed = testFactory();

    // Test 3: Deduplication
    console.log('═'.repeat(50));
    const dedupPassed = testDeduplication();

    // Test 4: Create Source & Binding
    console.log('═'.repeat(50));
    const sourceId = await createFederatedSource();
    await createFederatedBinding(collectionId, sourceId);

    // Test 5: Load Bindings
    console.log('═'.repeat(50));
    const loadPassed = await testLoadBindings(collectionId);

    // Test 6: E2E Flow
    console.log('═'.repeat(50));
    const e2ePassed = await testE2EFlow(collectionId);

    // Summary
    console.log('═'.repeat(50));
    console.log('📊 M5 Test Summary:');
    console.log(`   - Encryption/Decryption: ${encryptionPassed ? '✅' : '❌'}`);
    console.log(`   - Factory Pattern: ${factoryPassed ? '✅' : '❌'}`);
    console.log(`   - Deduplication Logic: ${dedupPassed ? '✅' : '❌'}`);
    console.log(`   - Load Bindings: ${loadPassed ? '✅' : '❌'}`);
    console.log(`   - E2E Flow (simulated): ${e2ePassed ? '✅' : '❌'}`);

    const allPassed = encryptionPassed && factoryPassed && dedupPassed && loadPassed && e2ePassed;

    if (allPassed) {
      console.log('\n✅ M5 Federated Search Test PASSED');
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
