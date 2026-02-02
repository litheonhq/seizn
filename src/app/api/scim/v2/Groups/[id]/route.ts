/**
 * SCIM 2.0 Group by ID Endpoint
 *
 * GET    /api/scim/v2/Groups/:id - Get group by ID
 * PUT    /api/scim/v2/Groups/:id - Replace group
 * PATCH  /api/scim/v2/Groups/:id - Partial update group (add/remove members)
 * DELETE /api/scim/v2/Groups/:id - Delete group
 *
 * RFC 7644 Section 3.4 - Querying Resources
 * RFC 7644 Section 3.5 - Modifying Resources
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateSCIMRequest } from '@/lib/scim/auth';
import { getGroup, updateGroup, patchGroup, deleteGroup } from '@/lib/scim/service';
import {
  createUnauthorizedError,
  createNotFoundError,
  createBadRequestError,
  createSCIMError,
} from '@/lib/scim/utils';
import type { CreateSCIMGroupRequest, SCIMPatchOperation } from '@/types/scim';
import { SCIM_SCHEMAS } from '@/types/scim';

const SCIM_CONTENT_TYPE = 'application/scim+json';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scim/v2/Groups/:id
 * Get group by ID
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
    const group = await getGroup(id, auth.organizationId);

    if (!group) {
      return NextResponse.json(createNotFoundError('Group', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(group, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM GET /Groups/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * PUT /api/scim/v2/Groups/:id
 * Replace group (full update)
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
    const body = (await request.json()) as CreateSCIMGroupRequest;

    // Validate required fields
    if (!body.displayName) {
      return NextResponse.json(
        createBadRequestError('displayName is required', 'invalidValue'),
        { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    const group = await updateGroup(id, auth.organizationId, body);

    if (!group) {
      return NextResponse.json(createNotFoundError('Group', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(group, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM PUT /Groups/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * PATCH /api/scim/v2/Groups/:id
 * Partial update group using SCIM PATCH operations
 * Primary use case: Add/remove members from a group
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

    const group = await patchGroup(id, auth.organizationId, operations);

    if (!group) {
      return NextResponse.json(createNotFoundError('Group', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return NextResponse.json(group, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM PATCH /Groups/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * DELETE /api/scim/v2/Groups/:id
 * Delete group
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
    const deleted = await deleteGroup(id, auth.organizationId);

    if (!deleted) {
      return NextResponse.json(createNotFoundError('Group', id), {
        status: 404,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('SCIM DELETE /Groups/:id error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}
