import { NextRequest, NextResponse } from 'next/server';
import { getSCIMService, SCIMService } from '@/lib/enterprise';

// Extract org from SCIM URL path
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
 * GET /api/scim/v2/Users/:id - Get user by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const scimService = getSCIMService();
  const user = scimService.getUser(id);

  if (!user) {
    return NextResponse.json(
      SCIMService.createError(404, 'User not found'),
      { status: 404 }
    );
  }

  return NextResponse.json(user);
}

/**
 * PUT /api/scim/v2/Users/:id - Replace user
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const scimService = getSCIMService();
    const user = scimService.updateUser(id, body);

    if (!user) {
      return NextResponse.json(
        SCIMService.createError(404, 'User not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('SCIM update user error:', error);
    return NextResponse.json(
      SCIMService.createError(500, 'Internal server error'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/scim/v2/Users/:id - Partial update user
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const operations = body.Operations || body.operations || [];

    const scimService = getSCIMService();
    const user = scimService.patchUser(id, operations);

    if (!user) {
      return NextResponse.json(
        SCIMService.createError(404, 'User not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('SCIM patch user error:', error);
    return NextResponse.json(
      SCIMService.createError(500, 'Internal server error'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scim/v2/Users/:id - Delete user
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const scimService = getSCIMService();
  const deleted = scimService.deleteUser(id);

  if (!deleted) {
    return NextResponse.json(
      SCIMService.createError(404, 'User not found'),
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
