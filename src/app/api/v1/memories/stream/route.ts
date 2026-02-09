/**
 * SSE Memory Stream
 *
 * GET /api/v1/memories/stream - Real-time memory change notifications via Server-Sent Events.
 *
 * Query params:
 *   namespace - Filter by namespace (default: all)
 *   token     - API key for browser EventSource (which cannot send custom headers)
 *
 * Usage (Node.js / polyfill with headers):
 *   const es = new EventSource('/api/v1/memories/stream?namespace=default', {
 *     headers: { Authorization: 'Bearer szn_...' }
 *   });
 *
 * Usage (browser native EventSource):
 *   const es = new EventSource('/api/v1/memories/stream?token=szn_...');
 *   es.onmessage = (e) => console.log(JSON.parse(e.data));
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: Response }> {
  // Standard header auth first
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }

  // Query parameter token fallback (for browser EventSource)
  const tokenParam = new URL(request.url).searchParams.get('token');
  if (tokenParam) {
    const tokenRequest = new NextRequest(request.url, {
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        'authorization': `Bearer ${tokenParam}`,
      }),
    });
    const tokenResult = await authenticateRequest(tokenRequest, { skipUsageCheck: false });
    if (!isAuthError(tokenResult)) {
      return { userId: tokenResult.userId, keyId: tokenResult.keyId };
    }
  }

  // Session fallback
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

export async function GET(request: NextRequest) {
  const result = await resolveAuth(request);
  if ('error' in result) return result.error;

  const { userId } = result;
  const { searchParams } = new URL(request.url);
  const namespace = searchParams.get('namespace');
  const pollIntervalMs = 2000;

  const encoder = new TextEncoder();
  let lastCheckAt = new Date().toISOString();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: lastCheckAt })}\n\n`)
      );

      // Poll for new/updated/deleted memories
      const poll = async () => {
        if (closed) return;

        try {
          const supabase = createServerClient();

          // Check for new memories since last poll
          let query = supabase
            .from('memories')
            .select('id, content, memory_type, tags, namespace, importance, created_at, updated_at, is_deleted')
            .eq('user_id', userId)
            .or(`created_at.gte.${lastCheckAt},updated_at.gte.${lastCheckAt}`)
            .order('updated_at', { ascending: false })
            .limit(50);

          if (namespace) {
            query = query.eq('namespace', namespace);
          }

          const { data: memories } = await query;

          if (memories && memories.length > 0) {
            for (const memory of memories) {
              const eventType = memory.is_deleted
                ? 'memory.deleted'
                : new Date(memory.created_at).toISOString() === new Date(memory.updated_at).toISOString()
                  ? 'memory.created'
                  : 'memory.updated';

              const eventData = JSON.stringify({
                event: eventType,
                memory: {
                  id: memory.id,
                  content: memory.content,
                  memory_type: memory.memory_type,
                  tags: memory.tags,
                  namespace: memory.namespace,
                  importance: memory.importance,
                },
                timestamp: memory.updated_at,
              });

              controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${eventData}\n\n`));
            }
          }

          // Send heartbeat
          controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));

          lastCheckAt = new Date().toISOString();
        } catch (error) {
          console.error('[SSE] Poll error:', error);
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Poll failed' })}\n\n`)
          );
        }

        if (!closed) {
          setTimeout(poll, pollIntervalMs);
        }
      };

      // Start polling
      setTimeout(poll, pollIntervalMs);
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
