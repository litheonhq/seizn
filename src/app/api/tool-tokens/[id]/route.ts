/**
 * Tool Token API
 *
 * Get and revoke a specific tool token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { createToolGatingService } from '@/lib/tool-gating';
import { verifyCsrfToken } from '@/lib/csrf';
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

    const service = createToolGatingService(supabase);
    const token = await service.getToken(id);

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Remove sensitive fields
    const { tokenHash: _tokenHash, ...safeToken } = token;

    return NextResponse.json({ token: safeToken });
  } catch (error) {
    logServerError('Get token error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const csrfErr = verifyCsrfToken(request);
    if (csrfErr) return csrfErr;

    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Check admin access via RLS
    const service = createToolGatingService(supabase);
    await service.revokeToken(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerError('Revoke token error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
