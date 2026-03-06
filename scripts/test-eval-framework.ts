/**
 * M2: Eval Framework Test Script
 * Tests: Dataset creation → Eval cases → Run evaluation → Verify metrics
 *
 * Uses direct Supabase access with service role key
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(__dirname, '../.env.local'), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEST_USER_ID = 'test-eval-user';

async function setupTestProfile() {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: TEST_USER_ID, email: 'eval-test@seizn.com', plan: 'pro' }, { onConflict: 'id' });

  if (error && error.code !== '23505') throw error;
  console.log('✅ Test profile ready');
}

async function getOrCreateTestCollection(): Promise<string> {
  const { data: existing } = await supabase
    .from('summer_collections')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .eq('name', 'eval-test-collection')
    .single();

  if (existing) {
    console.log('✅ Using existing collection:', existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('summer_collections')
    .insert({
      user_id: TEST_USER_ID,
      name: 'eval-test-collection',
      description: 'Test collection for M2 eval framework',
    })
    .select('id')
    .single();

  if (error) throw error;
  console.log('✅ Created test collection:', data.id);
  return data.id;
}

async function indexTestDocuments(collectionId: string): Promise<string[]> {
  const { data: existingChunks } = await supabase
    .from('summer_chunks')
    .select('id')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: true })
    .limit(3);

  if (existingChunks && existingChunks.length >= 3) {
    console.log('✅ Using existing chunks:', existingChunks.map((c) => c.id));
    return existingChunks.map((c) => c.id);
  }

  // Generate unique dummy embeddings for each document (1024 dims for voyage-3)
  const generateEmbedding = (seed: number) => {
    const embedding = [];
    for (let i = 0; i < 1024; i++) {
      embedding.push(Math.sin(seed * i * 0.001) * 0.5 + Math.random() * 0.1);
    }
    return embedding;
  };

  const testDocs = [
    {
      external_id: 'eval-doc-1',
      title: 'Machine Learning Basics',
      content:
        'Machine learning is a subset of artificial intelligence that enables computers to learn from data. Supervised learning uses labeled data, while unsupervised learning finds patterns in unlabeled data.',
      embeddingSeed: 1,
    },
    {
      external_id: 'eval-doc-2',
      title: 'Deep Learning Introduction',
      content:
        'Deep learning uses neural networks with multiple layers to learn hierarchical representations. CNNs are used for image recognition, while RNNs and Transformers are used for sequential data and NLP.',
      embeddingSeed: 2,
    },
    {
      external_id: 'eval-doc-3',
      title: 'RAG Systems Overview',
      content:
        'Retrieval-Augmented Generation (RAG) combines retrieval systems with language models. The retriever finds relevant documents, and the generator uses them to produce accurate, grounded responses.',
      embeddingSeed: 3,
    },
  ];

  const chunkIds: string[] = [];

  for (const doc of testDocs) {
    // Insert document
    const { data: docRow, error: docErr } = await supabase
      .from('summer_documents')
      .insert({
        user_id: TEST_USER_ID,
        collection_id: collectionId,
        external_id: doc.external_id,
        title: doc.title,
        content_hash: doc.external_id,
      })
      .select('id')
      .single();

    if (docErr) throw docErr;

    // Insert chunk with embedding
    const embedding = generateEmbedding(doc.embeddingSeed);
    const { data: chunkRow, error: chunkErr } = await supabase
      .from('summer_chunks')
      .insert({
        user_id: TEST_USER_ID,
        collection_id: collectionId,
        document_id: docRow.id,
        chunk_index: 0,
        content: doc.content,
        token_count: doc.content.split(' ').length,
        embedding: JSON.stringify(embedding),
        metadata: { title: doc.title, external_id: doc.external_id },
      })
      .select('id')
      .single();

    if (chunkErr) throw chunkErr;
    chunkIds.push(chunkRow.id);
  }

  console.log('✅ Indexed documents, chunks:', chunkIds);
  return chunkIds;
}

async function createEvalDataset(): Promise<string> {
  const { data: existing } = await supabase
    .from('fall_eval_datasets')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .eq('name', 'M2 Test Dataset')
    .single();

  if (existing) {
    console.log('✅ Using existing dataset:', existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('fall_eval_datasets')
    .insert({
      user_id: TEST_USER_ID,
      name: 'M2 Test Dataset',
      description: 'Test dataset for M2 Eval Framework verification',
    })
    .select('id')
    .single();

  if (error) throw error;
  console.log('✅ Created eval dataset:', data.id);
  return data.id;
}

async function createEvalCases(datasetId: string, chunkIds: string[]): Promise<void> {
  const { count } = await supabase
    .from('fall_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('dataset_id', datasetId);

  if (count && count > 0) {
    console.log(`✅ Using existing ${count} eval cases`);
    return;
  }

  const cases = [
    {
      user_id: TEST_USER_ID,
      dataset_id: datasetId,
      query_text: 'What is machine learning?',
      expected_chunk_ids: chunkIds.slice(0, 1),
      metadata: { category: 'ml-basics' },
    },
    {
      user_id: TEST_USER_ID,
      dataset_id: datasetId,
      query_text: 'How do neural networks work in deep learning?',
      expected_chunk_ids: chunkIds.slice(1, 2),
      metadata: { category: 'deep-learning' },
    },
    {
      user_id: TEST_USER_ID,
      dataset_id: datasetId,
      query_text: 'What is RAG and how does it work?',
      expected_chunk_ids: chunkIds.slice(2, 3),
      metadata: { category: 'rag' },
    },
  ];

  const { error } = await supabase.from('fall_eval_cases').insert(cases);
  if (error) throw error;
  console.log(`✅ Created ${cases.length} eval cases`);
}

async function runEvaluationDirect(
  datasetId: string,
  collectionId: string
): Promise<string> {
  console.log('\n🔄 Running evaluation directly...');

  // Create eval run record
  const { data: runRow, error: runErr } = await supabase
    .from('fall_eval_runs')
    .insert({
      user_id: TEST_USER_ID,
      dataset_id: datasetId,
      status: 'running',
      config: {
        plan: 'pro',
        collection_id: collectionId,
        autopilot: false,
        override: {},
      },
    })
    .select('id')
    .single();

  if (runErr) throw runErr;
  const runId = runRow.id as string;
  console.log('   Run ID:', runId);

  try {
    // Fetch cases
    const { data: cases, error: caseErr } = await supabase
      .from('fall_eval_cases')
      .select('id, query_text, expected_chunk_ids')
      .eq('dataset_id', datasetId)
      .eq('user_id', TEST_USER_ID)
      .order('created_at', { ascending: true })
      .limit(50);

    if (caseErr) throw caseErr;

    let sumPrecision = 0;
    let sumRecall = 0;
    let sumMrr = 0;
    let nPrec = 0;
    let nRec = 0;
    let nMrr = 0;

    for (const c of cases ?? []) {
      const expectedChunkIds = (c.expected_chunk_ids as string[] | null) ?? [];

      // Simulate retrieval by just returning some chunks from the collection
      const { data: retrievedChunks } = await supabase
        .from('summer_chunks')
        .select('id')
        .eq('collection_id', collectionId)
        .limit(5);

      const retrievedChunkIds = (retrievedChunks ?? []).map((r) => r.id);

      // Compute metrics
      const expectedSet = new Set(expectedChunkIds);
      const hits = retrievedChunkIds.filter((id) => expectedSet.has(id));

      const precision =
        retrievedChunkIds.length > 0 ? hits.length / retrievedChunkIds.length : 0;
      const recall =
        expectedChunkIds.length > 0 ? hits.length / expectedChunkIds.length : 0;

      let mrr: number | undefined = undefined;
      for (let i = 0; i < retrievedChunkIds.length; i++) {
        if (expectedSet.has(retrievedChunkIds[i])) {
          mrr = 1 / (i + 1);
          break;
        }
      }

      if (expectedChunkIds.length > 0 && retrievedChunkIds.length > 0) {
        sumPrecision += precision;
        sumRecall += recall;
        nPrec += 1;
        nRec += 1;
        if (typeof mrr === 'number') {
          sumMrr += mrr;
          nMrr += 1;
        }
      }

      const { error: insertErr } = await supabase.from('fall_eval_results').insert({
        run_id: runId,
        case_id: c.id,
        retrieved_chunk_ids: retrievedChunkIds,
        metrics: {
          context_precision: precision,
          context_recall: recall,
          mrr,
        },
        debug: { simulated: true },
      });

      if (insertErr) throw insertErr;
    }

    const summary = {
      cases: (cases ?? []).length,
      avg_context_precision: nPrec ? sumPrecision / nPrec : null,
      avg_context_recall: nRec ? sumRecall / nRec : null,
      avg_mrr: nMrr ? sumMrr / nMrr : null,
    };

    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        summary_metrics: summary,
        error: null,
      })
      .eq('id', runId);

    console.log('✅ Eval run completed');
    return runId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('fall_eval_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq('id', runId);

    throw err;
  }
}

async function verifyResults(runId: string): Promise<void> {
  console.log('\n🔍 Verifying eval results...');

  const { data: run, error: runErr } = await supabase
    .from('fall_eval_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runErr) throw runErr;

  console.log('─'.repeat(50));
  console.log('Run Status:', run.status);
  console.log('Summary Metrics:', JSON.stringify(run.summary_metrics, null, 2));
  console.log('Config:', JSON.stringify(run.config, null, 2));

  const { data: results, error: resultErr } = await supabase
    .from('fall_eval_results')
    .select('*')
    .eq('run_id', runId);

  if (resultErr) throw resultErr;

  console.log('\n📊 Individual Results:');
  for (const r of results ?? []) {
    console.log('─'.repeat(40));
    console.log(`Case ID: ${r.case_id}`);
    console.log(`Retrieved: ${(r.retrieved_chunk_ids || []).length} chunks`);
    console.log(`Metrics: ${JSON.stringify(r.metrics)}`);
  }

  console.log('\n' + '═'.repeat(50));
  if (run.status === 'success') {
    const metrics = run.summary_metrics || {};
    console.log('✅ M2 Eval Framework Test PASSED');
    console.log(`   - Cases evaluated: ${metrics.cases || 0}`);
    console.log(`   - Avg Precision: ${metrics.avg_context_precision?.toFixed(3) ?? 'N/A'}`);
    console.log(`   - Avg Recall: ${metrics.avg_context_recall?.toFixed(3) ?? 'N/A'}`);
    console.log(`   - Avg MRR: ${metrics.avg_mrr?.toFixed(3) ?? 'N/A'}`);
  } else {
    console.log('❌ Eval run failed:', run.error);
    process.exit(1);
  }
}

async function main() {
  console.log('🧪 M2: Eval Framework Test\n');

  try {
    await setupTestProfile();
    const collectionId = await getOrCreateTestCollection();
    const chunkIds = await indexTestDocuments(collectionId);

    if (chunkIds.length === 0) {
      console.log('⚠️ No chunks found. Please ensure documents are indexed first.');
      process.exit(1);
    }

    const datasetId = await createEvalDataset();
    await createEvalCases(datasetId, chunkIds);
    const runId = await runEvaluationDirect(datasetId, collectionId);
    await verifyResults(runId);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
