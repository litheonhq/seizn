import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sentry/incidents/[id]
 * Get incident details with events and related traces
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    const supabase = createServerClient();

    // Get incident
    const { data: incident, error: incidentError } = await supabase
      .from('retops_incidents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (incidentError || !incident) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Get events timeline
    const { data: events, error: eventsError } = await supabase
      .from('retops_incident_events')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
    }

    // Get related traces (from affected_traces array)
    let relatedTraces: Record<string, unknown>[] = [];
    const affectedTraceIds = incident.affected_traces as string[] || [];

    if (affectedTraceIds.length > 0) {
      const { data: traces, error: tracesError } = await supabase
        .from('fall_retrieval_traces')
        .select('id, request_id, query_hash, timings_ms, results_count, error, created_at')
        .in('id', affectedTraceIds.slice(0, 10))
        .order('created_at', { ascending: false });

      if (!tracesError && traces) {
        relatedTraces = traces;
      }
    }

    return NextResponse.json({
      success: true,
      incident: {
        ...incident,
        rca_candidates: incident.rca_candidates ?? [],
        affected_traces: affectedTraceIds,
      },
      events: events ?? [],
      relatedTraces,
    });
  } catch (err) {
    console.error('Get incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sentry/incidents/[id]
 * Update incident (status, severity, notes)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;
    const body = await request.json();

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: checkError } = await supabase
      .from('retops_incidents')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    const allowedFields = ['status', 'severity', 'resolution_notes', 'description'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Handle status changes
    if (updates.status === 'resolved' && existing.status !== 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = userId;
    }

    // Update incident
    const { data: updated, error: updateError } = await supabase
      .from('retops_incidents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log status change event if status changed
    if (body.status && body.status !== existing.status) {
      await supabase.from('retops_incident_events').insert({
        incident_id: id,
        user_id: userId,
        event_type: 'status_change',
        metadata: {
          old_status: existing.status,
          new_status: body.status,
          notes: body.resolution_notes,
        },
      });
    }

    return NextResponse.json({
      success: true,
      incident: updated,
    });
  } catch (err) {
    console.error('Update incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sentry/incidents/[id]
 * Delete an incident
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    const supabase = createServerClient();

    const { error } = await supabase
      .from('retops_incidents')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
