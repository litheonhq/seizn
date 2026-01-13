import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sentry/incidents/[id]/resolve
 * Mark an incident as resolved
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    let notes: string | null = null;
    try {
      const body = await request.json();
      notes = body.notes ?? null;
    } catch {
      // No body is fine
    }

    const supabase = createServerClient();

    // Use the resolve_incident function
    const { data: success, error } = await supabase.rpc('resolve_incident', {
      p_incident_id: id,
      p_user_id: userId,
      p_notes: notes,
    });

    if (error) {
      throw error;
    }

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Incident not found or already resolved' },
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
      message: 'Incident resolved successfully',
    });
  } catch (err) {
    console.error('Resolve incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
