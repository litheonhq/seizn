/**
 * Policy Pack API
 *
 * Get and update a specific policy pack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createPolicyPackService } from '@/lib/policy-packs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createPolicyPackService(supabase);

    // Try by ID first, then by name
    let pack = await service.getPack(id);
    if (!pack) {
      pack = await service.getPackByName(id);
    }

    if (!pack) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }

    // Get latest version
    const latestVersion = await service.getLatestVersion(pack.id);

    // Get all versions
    const versions = await service.listVersions(pack.id);

    return NextResponse.json({
      pack,
      latestVersion,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt,
        changelog: v.changelog,
      })),
    });
  } catch (error) {
    console.error('Get pack error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const service = createPolicyPackService(supabase);

    const pack = await service.updatePack(id, body);

    return NextResponse.json({ pack });
  } catch (error) {
    console.error('Update pack error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
