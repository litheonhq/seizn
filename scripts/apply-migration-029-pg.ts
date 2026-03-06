/**
 * Apply migration 029: Fix Summer DB Issues
 * Uses postgres library for direct SQL execution
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import postgres from 'postgres';

config({ path: resolve(__dirname, '../.env.local'), override: true });

const DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

async function main() {
  console.log('🚀 Applying Migration 029: Fix Summer DB Issues\n');
  console.log('═'.repeat(60));

  const sql = postgres(DATABASE_URL!, { ssl: 'require' });

  try {
    // 1. Drop the partial unique index
    console.log('\n1️⃣ Dropping partial unique index...');
    await sql`DROP INDEX IF EXISTS idx_summer_documents_collection_external`;
    console.log('   ✅ Done');

    // 2. Add unique constraint (if not exists)
    console.log('\n2️⃣ Adding unique constraint...');
    try {
      await sql`
        ALTER TABLE summer_documents
        DROP CONSTRAINT IF EXISTS summer_documents_collection_external_unique
      `;
      await sql`
        ALTER TABLE summer_documents
        ADD CONSTRAINT summer_documents_collection_external_unique
        UNIQUE (collection_id, external_id)
      `;
      console.log('   ✅ Done');
    } catch (err: any) {
      if (err.code === '23505') {
        console.log('   ⚠️ Duplicate values exist, need to clean up first');
      } else if (err.code === '42P07') {
        console.log('   ℹ️ Constraint already exists');
      } else {
        throw err;
      }
    }

    // 3. Recreate search functions with DOUBLE PRECISION
    console.log('\n3️⃣ Recreating summer_search_chunks function...');
    await sql`
      CREATE OR REPLACE FUNCTION summer_search_chunks(
        query_embedding vector(1024),
        match_user_id TEXT,
        match_collection_id UUID,
        match_count INT DEFAULT 10,
        match_threshold DOUBLE PRECISION DEFAULT 0.5,
        search_ef INT DEFAULT 40
      )
      RETURNS TABLE (
        chunk_id UUID,
        document_id UUID,
        content TEXT,
        metadata JSONB,
        similarity DOUBLE PRECISION,
        created_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

        RETURN QUERY
        SELECT
          c.id AS chunk_id,
          c.document_id,
          c.content,
          c.metadata,
          (1 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity,
          c.created_at
        FROM summer_chunks c
        WHERE c.user_id = match_user_id
          AND c.collection_id = match_collection_id
          AND c.embedding IS NOT NULL
          AND 1 - (c.embedding <=> query_embedding) > match_threshold
        ORDER BY c.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `;
    console.log('   ✅ Done');

    // 4. Recreate keyword search function
    console.log('\n4️⃣ Recreating summer_keyword_search_chunks function...');
    await sql`
      CREATE OR REPLACE FUNCTION summer_keyword_search_chunks(
        query_text TEXT,
        match_user_id TEXT,
        match_collection_id UUID,
        match_count INT DEFAULT 10
      )
      RETURNS TABLE (
        chunk_id UUID,
        document_id UUID,
        content TEXT,
        metadata JSONB,
        rank DOUBLE PRECISION,
        created_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          c.id AS chunk_id,
          c.document_id,
          c.content,
          c.metadata,
          ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text))::DOUBLE PRECISION AS rank,
          c.created_at
        FROM summer_chunks c
        WHERE c.user_id = match_user_id
          AND c.collection_id = match_collection_id
          AND c.content_tsv @@ plainto_tsquery('simple', query_text)
        ORDER BY rank DESC
        LIMIT match_count;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `;
    console.log('   ✅ Done');

    // 5. Recreate hybrid search function
    console.log('\n5️⃣ Recreating summer_hybrid_search_chunks function...');
    await sql`
      CREATE OR REPLACE FUNCTION summer_hybrid_search_chunks(
        query_text TEXT,
        query_embedding vector(1024),
        match_user_id TEXT,
        match_collection_id UUID,
        match_count INT DEFAULT 10,
        match_threshold DOUBLE PRECISION DEFAULT 0.5,
        keyword_weight DOUBLE PRECISION DEFAULT 0.3,
        vector_weight DOUBLE PRECISION DEFAULT 0.7,
        search_ef INT DEFAULT 40
      )
      RETURNS TABLE (
        chunk_id UUID,
        document_id UUID,
        content TEXT,
        metadata JSONB,
        similarity DOUBLE PRECISION,
        keyword_rank DOUBLE PRECISION,
        combined_score DOUBLE PRECISION,
        created_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      DECLARE
        k CONSTANT INT := 60;
      BEGIN
        PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

        RETURN QUERY
        WITH
        vector_results AS (
          SELECT
            c.id AS chunk_id,
            c.document_id,
            c.content,
            c.metadata,
            (1 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS vec_similarity,
            ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) AS vec_rank
          FROM summer_chunks c
          WHERE c.user_id = match_user_id
            AND c.collection_id = match_collection_id
            AND c.embedding IS NOT NULL
            AND 1 - (c.embedding <=> query_embedding) > match_threshold
          ORDER BY c.embedding <=> query_embedding
          LIMIT match_count * 2
        ),
        keyword_results AS (
          SELECT
            c.id AS chunk_id,
            c.document_id,
            c.content,
            c.metadata,
            ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text))::DOUBLE PRECISION AS kw_rank,
            ROW_NUMBER() OVER (
              ORDER BY ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) DESC
            ) AS kw_row_rank
          FROM summer_chunks c
          WHERE c.user_id = match_user_id
            AND c.collection_id = match_collection_id
            AND c.content_tsv @@ plainto_tsquery('simple', query_text)
          ORDER BY ts_rank_cd(c.content_tsv, plainto_tsquery('simple', query_text)) DESC
          LIMIT match_count * 2
        ),
        combined AS (
          SELECT
            COALESCE(v.chunk_id, kw.chunk_id) AS chunk_id,
            COALESCE(v.document_id, kw.document_id) AS document_id,
            COALESCE(v.content, kw.content) AS content,
            COALESCE(v.metadata, kw.metadata) AS metadata,
            COALESCE(v.vec_similarity, 0::DOUBLE PRECISION) AS similarity,
            COALESCE(kw.kw_rank, 0::DOUBLE PRECISION) AS keyword_rank,
            (
              vector_weight * (1.0 / (k + COALESCE(v.vec_rank, match_count * 2))) +
              keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, match_count * 2)))
            )::DOUBLE PRECISION AS combined_score
          FROM vector_results v
          FULL OUTER JOIN keyword_results kw ON v.chunk_id = kw.chunk_id
        )
        SELECT
          c.chunk_id,
          c.document_id,
          c.content,
          c.metadata,
          c.similarity,
          c.keyword_rank,
          c.combined_score,
          sc.created_at
        FROM combined c
        JOIN summer_chunks sc ON sc.id = c.chunk_id
        ORDER BY c.combined_score DESC
        LIMIT match_count;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `;
    console.log('   ✅ Done');

    // 6. Add index for better performance
    console.log('\n6️⃣ Adding index for external_id...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_summer_documents_external_id
      ON summer_documents(external_id)
      WHERE external_id IS NOT NULL
    `;
    console.log('   ✅ Done');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Migration 029 applied successfully!');

  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
