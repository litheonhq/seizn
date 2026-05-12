import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { ServerErrors } from '@/lib/api-error';
import { logMemoryAccess } from '@/lib/audit';
import { recordRecall } from '@/lib/memory/budget';
import {
  listMemoryImageAttachments,
  type MemoryImageAttachmentRecord,
} from '@/lib/memory/image-attachments';

const META = { version: 'v1' as const };

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function isNoRowsError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  return error?.code === 'PGRST116';
}

function isMissingPinnedColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error || error.code !== '42703') return false;
  return (error.message || '').toLowerCase().includes('pinned');
}

async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

// GET /api/v1/memories/[id] - Get a specific memory
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { id } = await params;

    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select(
        'id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, companion_meta, scope, source, confidence, importance, created_at, updated_at'
      )
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (fetchError) {
      if (isNoRowsError(fetchError)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'not_found', message: 'Memory not found' },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 404 }
        );
      }

      console.error('[v1/memories/:id] Fetch error:', fetchError);
      return ServerErrors.database('get_memory');
    }

    if (!memory) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'not_found', message: 'Memory not found' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 404 }
      );
    }

    let attachments: MemoryImageAttachmentRecord[] = [];
    try {
      attachments = await listMemoryImageAttachments({ supabase, userId, memoryId: id });
    } catch (attachmentError) {
      console.error('[v1/memories/:id] Attachment fetch error:', attachmentError);
    }

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories/[id]', method: 'GET', startTime },
        200
      );
    }

    logMemoryAccess(request, userId, keyId ?? undefined, 'read', {
      memoryId: id,
    }).catch(console.error);
    recordRecall(id, supabase).catch(console.error);

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { memory, attachments },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories/:id] GET error:', error);
    return ServerErrors.internal('get_memory');
  }
}

// Upper bound for content rewrites via PATCH. Matches the same ceiling we
// enforce on POST: large content bloats Voyage embedding cost and slows the
// keyword tsvector + index lookups. Anything over this should be split into
// multiple memories.
const MAX_PATCH_CONTENT_LENGTH = 16_000;

// PATCH /api/v1/memories/[id] - Update budget metadata or rewrite content
//
// Accepted shapes:
//   { pinned: boolean }
//   { content: string }   - replaces the row's content text; the generated
//                            content_tsv column is recomputed automatically
//                            by Postgres on UPDATE.
// At least one of pinned/content must be provided.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const body = (await request.json().catch(() => null)) as
      | { pinned?: unknown; content?: unknown }
      | null;
    const hasPinned = typeof body?.pinned === 'boolean';
    const hasContent = typeof body?.content === 'string';

    if (!body || (!hasPinned && !hasContent)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_field',
            message: 'At least one of `pinned` (boolean) or `content` (string) is required.',
          },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    if (hasContent) {
      const content = body.content as string;
      if (content.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'invalid_field', message: 'content must be non-empty.' },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 400 }
        );
      }
      if (content.length > MAX_PATCH_CONTENT_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'invalid_field',
              message: `content must be <= ${MAX_PATCH_CONTENT_LENGTH} characters.`,
            },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 400 }
        );
      }
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (hasPinned) updatePayload.pinned = body.pinned;
    if (hasContent) {
      updatePayload.content = body.content;
      // Reset embedding so the v4 mirror / re-embedding pipeline picks up the
      // new content. Keyword search via content_tsv is updated automatically
      // (generated column).
      updatePayload.embedding = null;
    }

    const { data: memory, error: updateError } = await supabase
      .from('memories')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id, pinned, tier, entity_id, updated_at, content')
      .single();

    if (updateError) {
      if (isNoRowsError(updateError)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'not_found', message: 'Memory not found' },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 404 }
        );
      }

      if (isMissingPinnedColumnError(updateError)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'memory_budget_schema_missing',
              message: 'Memory budget migration has not been applied.',
            },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 503 }
        );
      }

      console.error('[v1/memories/:id] Patch error:', updateError);
      return ServerErrors.database('patch_memory');
    }

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories/[id]', method: 'PATCH', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { memory },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories/:id] PATCH error:', error);
    return ServerErrors.internal('patch_memory');
  }
}
