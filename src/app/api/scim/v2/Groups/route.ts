/**
 * SCIM 2.0 Groups Endpoint
 *
 * GET  /api/scim/v2/Groups - List groups with filtering and pagination
 * POST /api/scim/v2/Groups - Create a new group
 *
 * RFC 7644 Section 3.4 - Querying Resources
 * RFC 7644 Section 3.3 - Creating Resources
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateSCIMRequest } from '@/lib/scim/auth';
import { listGroups, createGroup } from '@/lib/scim/service';
import {
  createUnauthorizedError,
  createBadRequestError,
  createSCIMError,
} from '@/lib/scim/utils';
import type { CreateSCIMGroupRequest } from '@/types/scim';

const SCIM_CONTENT_TYPE = 'application/scim+json';

/**
 * GET /api/scim/v2/Groups
 * List groups with optional filtering, sorting, and pagination
 */
export async function GET(request: NextRequest) {
  // Authenticate request
  const auth = await authenticateSCIMRequest(request);
  if (!auth.success) {
    return NextResponse.json(createUnauthorizedError(), {
      status: auth.status,
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  }

  try {
    const { searchParams } = new URL(request.url);

    const options = {
      filter: searchParams.get('filter') || undefined,
      startIndex: parseInt(searchParams.get('startIndex') || '1', 10),
      count: parseInt(searchParams.get('count') || '100', 10),
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'ascending' | 'descending') || undefined,
      attributes: searchParams.get('attributes')?.split(',') || undefined,
      excludedAttributes: searchParams.get('excludedAttributes')?.split(',') || undefined,
    };

    const response = await listGroups(auth.organizationId, auth.configId, options);

    return NextResponse.json(response, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM GET /Groups error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * POST /api/scim/v2/Groups
 * Create a new group
 */
export async function POST(request: NextRequest) {
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

    const group = await createGroup(auth.organizationId, auth.configId, body);

    return NextResponse.json(group, {
      status: 201,
      headers: {
        'Content-Type': SCIM_CONTENT_TYPE,
        Location: group.meta.location,
      },
    });
  } catch (error) {
    console.error('SCIM POST /Groups error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}
