/**
 * BYOK KMS Configuration API - Single Config Operations
 *
 * GET    /api/byok/kms/[id] - Get KMS configuration
 * PATCH  /api/byok/kms/[id] - Update KMS configuration
 * DELETE /api/byok/kms/[id] - Delete KMS configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getKmsConfig,
  updateKmsConfig,
  deleteKmsConfig,
  validateKmsConfig,
  getProviderDisplayName,
} from '@/lib/byok/kms';
import { getUserOrgRole } from '@/lib/winter/org';

// Helper to get user from session token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/byok/kms/[id]
 * Get a single KMS configuration
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const config = await getKmsConfig(id);
    if (!config) {
      return NextResponse.json({ error: 'KMS configuration not found' }, { status: 404 });
    }

    // Check user has access
    const role = await getUserOrgRole(config.organization_id, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        provider_config_encrypted: undefined,
        provider_display_name: getProviderDisplayName(config.provider),
      },
    });
  } catch (error) {
    console.error('[BYOK KMS] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/byok/kms/[id]
 * Update a KMS configuration
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing config
    const existing = await getKmsConfig(id);
    if (!existing) {
      return NextResponse.json({ error: 'KMS configuration not found' }, { status: 404 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to update KMS configurations' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      provider_config,
      rotation_enabled,
      rotation_interval_days,
      is_active,
      is_default,
    } = body;

    // Handle special action: validate
    if (body.action === 'validate') {
      const result = await validateKmsConfig(id);
      return NextResponse.json({
        success: result.valid,
        validation: result,
      });
    }

    const config = await updateKmsConfig(
      {
        id,
        name,
        description,
        provider_config,
        rotation_enabled,
        rotation_interval_days,
        is_active,
        is_default,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        provider_config_encrypted: undefined,
        provider_display_name: getProviderDisplayName(config.provider),
      },
    });
  } catch (error) {
    console.error('[BYOK KMS] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/byok/kms/[id]
 * Delete a KMS configuration
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing config
    const existing = await getKmsConfig(id);
    if (!existing) {
      return NextResponse.json({ error: 'KMS configuration not found' }, { status: 404 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to delete KMS configurations' }, { status: 403 });
    }

    await deleteKmsConfig(id, user.id);

    return NextResponse.json({
      success: true,
      deleted: id,
    });
  } catch (error) {
    console.error('[BYOK KMS] DELETE error:', error);

    // Handle specific error for active DEKs
    if (error instanceof Error && error.message.includes('active encryption keys')) {
      return NextResponse.json({
        error: 'Cannot delete KMS configuration with active encryption keys',
        details: 'Deactivate all data encryption keys before deleting the KMS configuration',
      }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
