/**
 * Memory Flush API
 *
 * Immediately processes pending memories:
 * - Candidates → Active (with evaluation)
 * - Generate embeddings for new memories
 * - Create links between memories
 * - Update profile card
 *
 * Supports both session auth (dashboard) and API key auth (MCP/SDK).
 *
 * POST /api/memories/flush
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { createJobService } from '@/lib/spring/memory-v4/job-service';
import { runMemoryFlush, type FlushOptions } from '@/lib/spring/memory-v4/flush-service';

interface FlushRequest extends FlushOptions {
  /**
   * Queue the flush as an async spring job (`consolidate`) instead of
   * processing inline. Retry is then handled by /api/spring/jobs/[id] + cron.
   */
  async?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Dual auth: API key first, session fallback
    let userId: string;
    let authHeaders: Record<string, string> | undefined;

    const apiAuth = await authenticateRequest(request, { skipUsageCheck: false });
    if (!isAuthError(apiAuth)) {
      userId = apiAuth.userId;
      authHeaders = apiAuth.rateLimitHeaders;
    } else {
      const session = await auth();
      if (!session?.user?.id) {
        return authErrorResponse(apiAuth.authError);
      }
      userId = session.user.id;
    }
    const supabase = createServerClient();
    let body: FlushRequest = {};
    try {
      body = (await request.json()) as FlushRequest;
    } catch {
      // Allow empty body for defaults.
      body = {};
    }

    if (body.async === true) {
      const jobService = createJobService(supabase);
      const job = await jobService.createJob(userId, {
        jobType: 'consolidate',
        inputData: {
          flushOptions: {
            processCandidates: body.processCandidates,
            generateEmbeddings: body.generateEmbeddings,
            generateLinks: body.generateLinks,
            updateProfile: body.updateProfile,
            maxItems: body.maxItems,
          },
        },
      });

      const queuedResponse = NextResponse.json(
        {
          success: true,
          queued: true,
          message: 'Flush job queued',
          job: {
            id: job.id,
            jobType: job.jobType,
            status: job.status,
            createdAt: job.createdAt.toISOString(),
          },
        },
        { status: 202 }
      );

      if (authHeaders) {
        Object.entries(authHeaders).forEach(([key, value]) => {
          queuedResponse.headers.set(key, value);
        });
      }

      return queuedResponse;
    }

    const result = await runMemoryFlush(supabase, userId, body);
    const response = NextResponse.json(result, { status: 200 });

    // Attach rate-limit / deprecation headers from API key auth
    if (authHeaders) {
      Object.entries(authHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    console.error('Flush API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Flush failed' },
      { status: 500 }
    );
  }
}
