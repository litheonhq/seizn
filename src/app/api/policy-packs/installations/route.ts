/**
 * Policy Pack Installations API
 *
 * List and install policy packs for an organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createPolicyPackService } from '@/lib/policy-packs';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const service = createPolicyPackService(supabase);
    const installations = await service.listInstallations(membership.organization_id);

    // Enrich with pack info
    const enriched = await Promise.all(
      installations.map(async (installation) => {
        const pack = await service.getPack(installation.packId);
        const version = await service.getVersion(installation.versionId);
        return {
          ...installation,
          pack: pack
            ? {
                id: pack.id,
                name: pack.name,
                displayName: pack.displayName,
                category: pack.category,
                isOfficial: pack.isOfficial,
              }
            : null,
          version: version
            ? {
                id: version.id,
                version: version.version,
                status: version.status,
              }
            : null,
        };
      })
    );

    return NextResponse.json({ installations: enriched });
  } catch (error) {
    logServerError('List installations error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    // Only admins can install packs
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const service = createPolicyPackService(supabase);

    const installation = await service.installPack(
      membership.organization_id,
      body
    );

    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    logServerError('Install pack error', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
