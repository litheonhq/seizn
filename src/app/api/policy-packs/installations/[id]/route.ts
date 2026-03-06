/**
 * Policy Pack Installation API
 *
 * Get, update, and delete a specific installation.
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
    const installation = await service.getInstallation(id);

    if (!installation) {
      return NextResponse.json(
        { error: 'Installation not found' },
        { status: 404 }
      );
    }

    // Get related info
    const pack = await service.getPack(installation.packId);
    const version = await service.getVersion(installation.versionId);

    return NextResponse.json({
      installation: {
        ...installation,
        pack,
        version,
      },
    });
  } catch (error) {
    logServerError('Get installation error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const body = await request.json();
    const service = createPolicyPackService(supabase);

    const installation = await service.updateInstallation(id, body);

    return NextResponse.json({ installation });
  } catch (error) {
    logServerError('Update installation error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const service = createPolicyPackService(supabase);
    await service.uninstallPack(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerError('Uninstall pack error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
