import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import crypto from 'crypto';

interface ImportMemory {
  content: string;
  memory_type?: string;
  tags?: string[];
  namespace?: string;
  importance?: number;
  source?: string;
}

interface ImportRequest {
  memories: ImportMemory[];
  skip_duplicates?: boolean; // Skip if content already exists
}

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return (error.message || '').toLowerCase().includes('content_hash');
}

// POST /api/memories/import - Bulk import memories
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: ImportRequest = await request.json();

    if (!body.memories || !Array.isArray(body.memories) || body.memories.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories/import', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'memories array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    const MAX_BATCH_SIZE = 100;
    if (body.memories.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} memories per import` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const skipDuplicates = body.skip_duplicates !== false; // Default to true

    // If skip_duplicates, get existing content hashes for comparison.
    // Key format: `${namespace}:${content_hash}`
    let existingHashes = new Set<string>();
    let hasContentHashColumn = true;
    if (skipDuplicates) {
      const requestedNamespaces = Array.from(
        new Set(body.memories.map((m) => m.namespace || 'default'))
      );

      const { data: existing, error: existingError } = await supabase
        .from('memories')
        .select('namespace, content_hash')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .in('namespace', requestedNamespaces)
        .not('content_hash', 'is', null);

      if (existingError) {
        if (isMissingContentHashColumnError(existingError)) {
          hasContentHashColumn = false;
        } else {
          console.error('Failed to load existing hashes:', existingError);
        }
      } else if (existing) {
        existingHashes = new Set(
          existing
            .filter((m) => m.content_hash)
            .map((m) => `${m.namespace || 'default'}:${m.content_hash as string}`)
        );
      }
    }

    // Process memories
    const results = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    const memoriesToInsert = [];

    for (let i = 0; i < body.memories.length; i++) {
      const memory = body.memories[i];

      // Validate content
      if (!memory.content || memory.content.trim().length === 0) {
        results.failed++;
        results.errors.push(`Memory ${i}: Content is required`);
        continue;
      }
      if (memory.content.length > 10000) {
        results.failed++;
        results.errors.push(`Memory ${i}: Content too long (max 10,000 chars)`);
        continue;
      }

      const namespace = memory.namespace || 'default';
      const contentHash = crypto
        .createHash('sha256')
        .update(memory.content.replace(/\x00/g, ''))
        .digest('hex');
      const dedupKey = `${namespace}:${contentHash}`;

      // Skip duplicates using namespace-aware content hash
      if (skipDuplicates && hasContentHashColumn && existingHashes.has(dedupKey)) {
        results.skipped++;
        continue;
      }

      // Validate memory_type
      const validTypes = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
      const memoryType = memory.memory_type || 'fact';
      if (!validTypes.includes(memoryType)) {
        results.failed++;
        results.errors.push(`Memory ${i}: Invalid memory_type '${memory.memory_type}'`);
        continue;
      }

      try {
        // Sanitize null bytes and create embedding
         
        const cleanContent = memory.content.replace(/\x00/g, '');
        const embedding = await createEmbedding(cleanContent);

        const row: Record<string, unknown> = {
          user_id: userId,
          content: cleanContent,
          embedding,
          memory_type: memoryType,
          tags: memory.tags || [],
          namespace,
          importance: memory.importance || 5,
          source: memory.source || 'import',
          confidence: 1.0,
        };

        if (hasContentHashColumn) {
          row.content_hash = contentHash;
        }

        memoriesToInsert.push(row);

        // Add accepted item to dedup set to prevent in-request duplicates
        if (skipDuplicates && hasContentHashColumn) {
          existingHashes.add(dedupKey);
        }
      } catch {
        results.failed++;
        results.errors.push(`Memory ${i}: Failed to create embedding`);
      }
    }

    // Insert per row so one conflict/error won't fail the whole import batch.
    if (memoriesToInsert.length > 0) {
      if (skipDuplicates && !hasContentHashColumn) {
        results.errors.push(
          'content_hash column is unavailable; skip_duplicates could not be applied reliably'
        );
      }

      for (const row of memoriesToInsert) {
        if (skipDuplicates && hasContentHashColumn) {
          const { data, error: insertError } = await supabase
            .from('memories')
            .upsert(row, {
              onConflict: 'user_id,namespace,content_hash',
              ignoreDuplicates: true,
            })
            .select('id');

          if (insertError) {
            results.failed++;
            results.errors.push(`Insert failed: ${insertError.message}`);
            continue;
          }

          if (Array.isArray(data) && data.length > 0) {
            results.imported++;
          } else {
            results.skipped++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('memories')
            .insert(row);

          if (insertError) {
            results.failed++;
            results.errors.push(`Insert failed: ${insertError.message}`);
            continue;
          }

          results.imported++;
        }
      }
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/memories/import', method: 'POST', startTime },
      200,
      { embedding: body.memories.reduce((sum, m) => sum + (m.content?.length || 0), 0) }
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Import memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
