/**
 * Policy Pack Versions API
 *
 * List and create pack versions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createPolicyPackService } from '@/lib/policy-packs';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const service = createPolicyPackService(supabase);
    const versions = await service.listVersions(id);

    return NextResponse.json({ versions });
  } catch (error) {
    logServerError('List versions error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const body = await request.json();
    const service = createPolicyPackService(supabase);

    const version = await service.createVersion(id, body);

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    logServerError('Create version error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
