/**
 * BYOK KMS Key Rotation API
 *
 * POST /api/byok/kms/[id]/rotate - Rotate KMS key
 * GET  /api/byok/kms/[id]/rotate - Get rotation history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getKmsConfig,
  rotateKmsKey,
  getRotationHistory,
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
 * GET /api/byok/kms/[id]/rotate
 * Get rotation history for a KMS configuration
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const history = await getRotationHistory(id, limit);

    return NextResponse.json({
      success: true,
      history,
      rotation_settings: {
        rotation_enabled: config.rotation_enabled,
        rotation_interval_days: config.rotation_interval_days,
        last_rotated_at: config.last_rotated_at,
        next_rotation_at: config.next_rotation_at,
      },
    });
  } catch (error) {
    console.error('[BYOK KMS Rotate] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/byok/kms/[id]/rotate
 * Initiate key rotation
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

    // Check user is admin or owner
    const role = await getUserOrgRole(config.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to rotate KMS keys' }, { status: 403 });
    }

    // Check config is active
    if (!config.is_active) {
      return NextResponse.json({ error: 'Cannot rotate inactive KMS configuration' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rotationType = body.type === 'emergency' ? 'emergency' : 'manual';

    const rotation = await rotateKmsKey(id, user.id, rotationType);

    return NextResponse.json({
      success: true,
      rotation,
      message: 'Key rotation initiated successfully',
    });
  } catch (error) {
    console.error('[BYOK KMS Rotate] POST error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not supported')) {
        return NextResponse.json({
          error: 'Key rotation not supported by this provider',
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
