/**
 * Seizn API - EU AI Act Article 50 Transparency Events
 *
 * POST /api/winter/transparency - Create transparency event
 * GET /api/winter/transparency - Query transparency events
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  createTransparencyEvent,
  queryTransparencyEvents,
  CreateTransparencyEventInput,
  TransparencyEventFilter,
} from '@/lib/winter/transparency';
import { parsePagination } from '@/lib/parse-params';

/**
 * POST /api/winter/transparency
 * Create a new transparency event
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const body = await req.json();

    const input: CreateTransparencyEventInput = {
      eventType: body.eventType,
      disclosure: body.disclosure,
      content: body.content,
      sessionId: body.sessionId,
      traceId: body.traceId,
    };

    // Validate required fields
    if (!input.eventType) {
      return NextResponse.json({ error: 'eventType is required' }, { status: 400 });
    }

    if (!input.disclosure) {
      return NextResponse.json({ error: 'disclosure is required' }, { status: 400 });
    }

    const event = await createTransparencyEvent(
      membership.organization_id,
      user.id,
      input
    );

    return NextResponse.json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error('Failed to create transparency event:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transparency event' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/winter/transparency
 * Query transparency events
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);

    const filter: TransparencyEventFilter = {
      organizationId: membership.organization_id,
      eventTypes: searchParams.get('eventTypes')?.split(',') as any,
      contentTypes: searchParams.get('contentTypes')?.split(',') as any,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      ...parsePagination(searchParams, { limit: 100 }),
    };

    const result = await queryTransparencyEvents(filter);

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: filter.limit,
        offset: filter.offset,
      },
    });
  } catch (error) {
    console.error('Failed to query transparency events:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query transparency events' },
      { status: 500 }
    );
  }
}
