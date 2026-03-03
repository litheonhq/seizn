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
