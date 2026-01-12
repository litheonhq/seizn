/**
 * Summer MVP E2E Test Script
 *
 * Tests: Collection Create → Document Index → Retrieve
 *
 * Usage:
 *   npx tsx scripts/test-summer-api.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load .env.local from project root
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('SUPABASE_URL:', SUPABASE_URL);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '[SET]' : '[MISSING]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getOrCreateTestApiKey(userId: string): Promise<string> {
  // Check for existing test API key
  const { data: existing } = await supabase
    .from('api_keys')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'summer-test-key')
    .single();

  if (existing) {
    // Delete old key and create new one (we can't retrieve plaintext)
    await supabase.from('api_keys').delete().eq('id', existing.id);
  }

  // Generate new API key
  const plainKey = `szn_test_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const prefix = plainKey.slice(0, 12);

  const { error } = await supabase.from('api_keys').insert({
    user_id: userId,
    name: 'summer-test-key',
    key_hash: keyHash,
    key_prefix: prefix,
    is_active: true,
  });

  if (error) throw new Error(`Failed to create API key: ${error.message}`);

  return plainKey;
}

async function getOrCreateTestUser(): Promise<string> {
  // Check for existing test user
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'summer-test@seizn.local')
    .single();

  if (existing) {
    return existing.id;
  }

  // Create test user in profiles
  const userId = crypto.randomUUID();
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    email: 'summer-test@seizn.local',
    plan: 'pro',
  });

  if (error) throw new Error(`Failed to create test user: ${error.message}`);

  return userId;
}

async function testCollectionCreate(apiKey: string): Promise<string> {
  console.log('\n📁 Testing Collection Create...');

  const response = await fetch(`${BASE_URL}/api/summer/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      name: 'Summer Test Collection',
      description: 'Test collection for Summer MVP E2E',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Collection create failed: ${JSON.stringify(data)}`);
  }

  console.log('✅ Collection created:', data.collection.id);
  return data.collection.id;
}

async function testDocumentIndex(apiKey: string, collectionId: string): Promise<void> {
  console.log('\n📄 Testing Document Index...');

  const testDocuments = [
    {
      external_id: 'doc-1',
      title: 'Introduction to RAG',
      content: `Retrieval Augmented Generation (RAG) is a technique that enhances large language models
by providing them with relevant context retrieved from external knowledge bases.
RAG systems typically consist of three main components: a retriever, a knowledge base, and a generator.
The retriever finds relevant documents based on the user query.
The knowledge base stores documents as embeddings for efficient similarity search.
The generator produces responses using both the query and retrieved context.`,
    },
    {
      external_id: 'doc-2',
      title: 'Vector Search Basics',
      content: `Vector search, also known as similarity search or semantic search,
is a technique for finding items that are similar to a given query based on their vector representations.
Unlike traditional keyword search, vector search captures semantic meaning.
Documents and queries are converted to high-dimensional vectors using embedding models.
The similarity between vectors is typically measured using cosine similarity or dot product.
Modern vector databases like pgvector support efficient approximate nearest neighbor (ANN) search.`,
    },
    {
      external_id: 'doc-3',
      title: 'Embedding Models',
      content: `Embedding models transform text into dense vector representations that capture semantic meaning.
Popular embedding models include OpenAI's text-embedding-3, Voyage AI, and Cohere's embed models.
The quality of embeddings directly impacts RAG system performance.
Key considerations include: dimensionality, domain specificity, and language support.
Voyage AI's voyage-3 model offers 1024-dimensional embeddings optimized for retrieval tasks.`,
    },
  ];

  const response = await fetch(`${BASE_URL}/api/summer/index`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      collection_id: collectionId,
      documents: testDocuments,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Document index failed: ${JSON.stringify(data)}`);
  }

  console.log('✅ Documents indexed:', data.indexed);
}

async function testRetrieve(apiKey: string, collectionId: string): Promise<void> {
  console.log('\n🔍 Testing Retrieve...');

  const testQueries = [
    'What is RAG and how does it work?',
    'How does vector similarity search work?',
    'Which embedding model should I use?',
  ];

  for (const query of testQueries) {
    console.log(`\n  Query: "${query}"`);

    const response = await fetch(`${BASE_URL}/api/summer/retrieve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        collection_id: collectionId,
        query,
        autopilot: true,
        include_trace: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Retrieve failed: ${JSON.stringify(data)}`);
    }

    console.log(`  ✅ Found ${data.results.length} results`);
    console.log(`  ⚡ Timings: ${JSON.stringify(data.trace?.timingsMs)}`);
    console.log(`  📊 Config: mode=${data.config.mode}, topK=${data.config.topK}`);

    if (data.results.length > 0) {
      console.log(`  📝 Top result similarity: ${data.results[0].similarity?.toFixed(4)}`);
    }
  }
}

async function cleanup(apiKey: string, collectionId: string): Promise<void> {
  console.log('\n🧹 Cleaning up...');

  // Delete test collection (cascades to documents/chunks)
  const { error } = await supabase
    .from('summer_collections')
    .delete()
    .eq('id', collectionId);

  if (error) {
    console.warn('⚠️ Cleanup warning:', error.message);
  } else {
    console.log('✅ Test collection deleted');
  }
}

async function main() {
  console.log('🚀 Summer MVP E2E Test');
  console.log('='.repeat(50));
  console.log(`Base URL: ${BASE_URL}`);

  try {
    // Setup
    console.log('\n🔧 Setting up test environment...');
    const userId = await getOrCreateTestUser();
    console.log('  User ID:', userId);

    const apiKey = await getOrCreateTestApiKey(userId);
    console.log('  API Key:', apiKey.slice(0, 16) + '...');

    // Tests
    const collectionId = await testCollectionCreate(apiKey);
    await testDocumentIndex(apiKey, collectionId);

    // Wait a moment for embeddings to be stored
    console.log('\n⏳ Waiting for indexing to complete...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testRetrieve(apiKey, collectionId);

    // Cleanup
    await cleanup(apiKey, collectionId);

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
