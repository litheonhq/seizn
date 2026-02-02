/**
 * SCIM 2.0 User by ID Endpoint
 *
 * GET    /api/scim/v2/Users/:id - Get user by ID
 * PUT    /api/scim/v2/Users/:id - Replace user
 * PATCH  /api/scim/v2/Users/:id - Partial update user
 * DELETE /api/scim/v2/Users/:id - Delete user
 *
 * RFC 7644 Section 3.4 - Querying Resources
 * RFC 7644 Section 3.5 - Modifying Resources
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateSCIMRequest } from '@/lib/scim/auth';
import { getUser, updateUser, patchUser, deleteUser } from '@/lib/scim/service';
import {
  createUnauthorizedError,
  createNotFoundError,
  createBadRequestError,
  createSCIMError,
} from '@/lib/scim/utils';
import type { CreateSCIMUserRequest, SCIMPatchOperation } from '@/types/scim';
import { SCIM_SCHEMAS } from '@/types/scim';

const SCIM_CONTENT_TYPE = 'application/scim+json';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scim/v2/Users/:id
 * Get user by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate request
  const auth = await authenticateSCIMRequest(request);
  if (!auth.success) {
    return NextResponse.json(createUnauthorizedError(), {
      status: auth.status,
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  }

  try {
    const user = await getUser(id, auth.organizationId);

    if (!user) {
      return NextResponse.json(createNotFoundError('User', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(user, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM GET /Users/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * PUT /api/scim/v2/Users/:id
 * Replace user (full update)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate request
  const auth = await authenticateSCIMRequest(request);
  if (!auth.success) {
    return NextResponse.json(createUnauthorizedError(), {
      status: auth.status,
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  }

  try {
    const body = (await request.json()) as CreateSCIMUserRequest;

    // Validate required fields
    if (!body.userName) {
      return NextResponse.json(
        createBadRequestError('userName is required', 'invalidValue'),
        { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    const user = await updateUser(id, auth.organizationId, body);

    if (!user) {
      return NextResponse.json(createNotFoundError('User', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(user, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM PUT /Users/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * PATCH /api/scim/v2/Users/:id
 * Partial update user using SCIM PATCH operations
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate request
  const auth = await authenticateSCIMRequest(request);
  if (!auth.success) {
    return NextResponse.json(createUnauthorizedError(), {
      status: auth.status,
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  }

  try {
    const body = await request.json();

    // Validate PATCH request format
    const schemas = body.schemas || body.Schemas;
    if (!schemas || !schemas.includes(SCIM_SCHEMAS.PATCH_OP)) {
      return NextResponse.json(
        createBadRequestError(
          `Invalid PATCH request. Expected schema: ${SCIM_SCHEMAS.PATCH_OP}`,
          'invalidSyntax'
        ),
        { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    const operations: SCIMPatchOperation[] = body.Operations || body.operations || [];

    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json(
        createBadRequestError('PATCH request must include Operations array', 'invalidSyntax'),
        { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    // Validate each operation
    for (const op of operations) {
      if (!['add', 'remove', 'replace'].includes(op.op)) {
        return NextResponse.json(
          createBadRequestError(`Invalid operation: ${op.op}. Must be add, remove, or replace`, 'invalidValue'),
          { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
        );
      }
    }

    const user = await patchUser(id, auth.organizationId, operations);

    if (!user) {
      return NextResponse.json(createNotFoundError('User', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(user, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM PATCH /Users/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * DELETE /api/scim/v2/Users/:id
 * Delete user
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate request
  const auth = await authenticateSCIMRequest(request);
  if (!auth.success) {
    return NextResponse.json(createUnauthorizedError(), {
      status: auth.status,
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  }

  try {
    const deleted = await deleteUser(id, auth.organizationId);

    if (!deleted) {
      return NextResponse.json(createNotFoundError('User', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('SCIM DELETE /Users/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}
