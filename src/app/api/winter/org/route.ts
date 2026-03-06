/**
 * Winter Governance - Organization API
 *
 * GET  /api/winter/org - List user's organizations
 * POST /api/winter/org - Create new organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  createOrganization,
  getUserOrganizations,
} from '@/lib/winter/org';
import { logServerError } from '@/lib/server/logger';


/**
 * GET /api/winter/org
 * List all organizations the user belongs to
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizations = await getUserOrganizations(user.id);

    return NextResponse.json({
      success: true,
      organizations: organizations.map((o) => ({
        ...o.organization,
        role: o.role,
      })),
      count: organizations.length,
    });
  } catch (error) {
    logServerError('[WinterOrg] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org
 * Create a new organization
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, settings } = body;

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Organization name must be at least 2 characters' },
        { status: 400 }
      );
    }

    const organization = await createOrganization({
      name: name.trim(),
      slug,
      owner_id: user.id,
      settings,
    });

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    logServerError('[WinterOrg] POST error:', error);

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
