import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sentry/incidents/[id]/ignore
 * Mark an incident as ignored
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    let reason: string | null = null;
    try {
      const body = await request.json();
      reason = body.reason ?? null;
    } catch {
      // No body is fine
    }

    const supabase = createServerClient();

    // Use the ignore_incident function
    const { data: success, error } = await supabase.rpc('ignore_incident', {
      p_incident_id: id,
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) {
      throw error;
    }

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Get updated incident
    const { data: incident } = await supabase
      .from('retops_incidents')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json({
      success: true,
      incident,
      message: 'Incident ignored successfully',
    });
  } catch (err) {
    console.error('Ignore incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
