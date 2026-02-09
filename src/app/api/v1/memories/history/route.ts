/**
 * Memory Content History API
 *
 * GET /api/v1/memories/history?memory_id=xxx - Get content change history for a memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }
  return { error: authErrorResponse(authResult.authError) };
}

export async function GET(request: NextRequest) {
  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId } = result;
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('memory_id');

    if (!memoryId) {
      return ValidationErrors.missingField('memory_id');
    }

    const supabase = createServerClient();

    // Verify ownership
    const { data: memory } = await supabase
      .from('memories')
      .select('id, content, memory_type, tags, importance')
      .eq('id', memoryId)
      .eq('user_id', userId)
      .single();

    if (!memory) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      );
    }

    // Get history
    const { data: history, error } = await supabase
      .from('memory_content_history')
      .select('id, content, memory_type, tags, importance, version, changed_by, created_at')
      .eq('memory_id', memoryId)
      .order('version', { ascending: false });

    if (error) {
      console.error('[v1/memories/history] Error:', error);
      return ServerErrors.database('get_memory_history');
    }

    return NextResponse.json({
      success: true,
      data: {
        current: memory,
        history: history || [],
        versionCount: (history?.length || 0) + 1,
      },
      meta: { version: 'v1' },
    });
  } catch (error) {
    console.error('[v1/memories/history] Error:', error);
    return ServerErrors.internal('get_memory_history');
  }
}
