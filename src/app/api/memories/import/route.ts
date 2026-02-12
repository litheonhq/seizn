import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

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

    // If skip_duplicates, get existing content hashes
    let existingContents = new Set<string>();
    if (skipDuplicates) {
      const { data: existing } = await supabase
        .from('memories')
        .select('content')
        .eq('user_id', userId)
        .eq('is_deleted', false);

      if (existing) {
        existingContents = new Set(existing.map(m => m.content.toLowerCase().trim()));
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

      // Skip duplicates
      if (skipDuplicates && existingContents.has(memory.content.toLowerCase().trim())) {
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
        // eslint-disable-next-line no-control-regex
        const cleanContent = memory.content.replace(/\x00/g, '');
        const embedding = await createEmbedding(cleanContent);

        memoriesToInsert.push({
          user_id: userId,
          content: cleanContent,
          embedding,
          memory_type: memoryType,
          tags: memory.tags || [],
          namespace: memory.namespace || 'default',
          importance: memory.importance || 5,
          source: memory.source || 'import',
          confidence: 1.0,
        });
      } catch {
        results.failed++;
        results.errors.push(`Memory ${i}: Failed to create embedding`);
      }
    }

    // Batch insert
    if (memoriesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('memories')
        .insert(memoriesToInsert);

      if (insertError) {
        console.error('Batch insert error:', insertError);
        results.failed += memoriesToInsert.length;
        results.errors.push(`Batch insert failed: ${insertError.message}`);
      } else {
        results.imported = memoriesToInsert.length;
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
