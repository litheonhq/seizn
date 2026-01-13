import { NextRequest, NextResponse } from 'next/server';
import { getSCIMService, SCIMService } from '@/lib/enterprise';

/**
 * SCIM 2.0 Users Endpoint
 *
 * RFC 7644 compliant user management
 */

// Extract org from SCIM URL path (e.g., /api/scim/v2/Users?org=xxx)
function getOrgId(request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get('org');
}

// Validate SCIM bearer token
function validateSCIMAuth(request: NextRequest, orgId: string): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  const scimService = getSCIMService();
  return scimService.validateToken(orgId, token);
}

/**
 * GET /api/scim/v2/Users - List users
 */
export async function GET(request: NextRequest) {
  const orgId = getOrgId(request);
  if (!orgId) {
    return NextResponse.json(
      SCIMService.createError(400, 'Organization ID required'),
      { status: 400 }
    );
  }

  if (!validateSCIMAuth(request, orgId)) {
    return NextResponse.json(
      SCIMService.createError(401, 'Unauthorized'),
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startIndex = parseInt(searchParams.get('startIndex') || '1');
  const count = parseInt(searchParams.get('count') || '100');
  const filter = searchParams.get('filter') || undefined;

  const scimService = getSCIMService();
  const response = scimService.listUsers(orgId, { startIndex, count, filter });

  return NextResponse.json(response);
}

/**
 * POST /api/scim/v2/Users - Create user
 */
export async function POST(request: NextRequest) {
  const orgId = getOrgId(request);
  if (!orgId) {
    return NextResponse.json(
      SCIMService.createError(400, 'Organization ID required'),
      { status: 400 }
    );
  }

  if (!validateSCIMAuth(request, orgId)) {
    return NextResponse.json(
      SCIMService.createError(401, 'Unauthorized'),
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    if (!body.userName) {
      return NextResponse.json(
        SCIMService.createError(400, 'userName is required'),
        { status: 400 }
      );
    }

    const scimService = getSCIMService();
    const user = scimService.createUser(orgId, body);

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error('SCIM create user error:', error);
    return NextResponse.json(
      SCIMService.createError(500, 'Internal server error'),
      { status: 500 }
    );
  }
}
