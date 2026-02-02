/**
 * SCIM Token Regeneration Endpoint
 *
 * POST /api/organizations/:orgId/scim/token - Regenerate SCIM token
 *
 * Regenerates the SCIM bearer token. The old token is immediately invalidated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { createSCIMToken, getSCIMConfig } from '@/lib/scim/auth';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Check if user is an admin of the organization
 */
async function checkOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  return data?.role === 'admin' || data?.role === 'owner';
}

/**
 * POST /api/organizations/:orgId/scim/token
 * Regenerate SCIM token
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Check admin access
  const isAdmin = await checkOrgAdmin(session.user.id, orgId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check if SCIM is configured
  const existingConfig = await getSCIMConfig(orgId);
  if (!existingConfig) {
    return NextResponse.json(
      { error: 'SCIM is not configured for this organization' },
      { status: 400 }
    );
  }

  try {
    const { token, configId } = await createSCIMToken(orgId, session.user.id);

    return NextResponse.json({
      success: true,
      message: 'SCIM token regenerated. Save this token - it will not be shown again. The previous token is now invalid.',
      token, // Only returned on creation/regeneration
      configId,
    });
  } catch (error) {
    console.error('Failed to regenerate SCIM token:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate SCIM token' },
      { status: 500 }
    );
  }
}
