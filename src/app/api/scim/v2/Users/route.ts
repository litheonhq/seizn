/**
 * SCIM 2.0 Users Endpoint
 *
 * GET  /api/scim/v2/Users - List users with filtering and pagination
 * POST /api/scim/v2/Users - Create a new user
 *
 * RFC 7644 Section 3.4 - Querying Resources
 * RFC 7644 Section 3.3 - Creating Resources
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateSCIMRequest } from '@/lib/scim/auth';
import { listUsers, createUser, findUserByUserName } from '@/lib/scim/service';
import {
  createUnauthorizedError,
  createBadRequestError,
  createConflictError,
  createSCIMError,
} from '@/lib/scim/utils';
import type { CreateSCIMUserRequest } from '@/types/scim';

const SCIM_CONTENT_TYPE = 'application/scim+json';

/**
 * GET /api/scim/v2/Users
 * List users with optional filtering, sorting, and pagination
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

    const response = await listUsers(auth.organizationId, auth.configId, options);

    return NextResponse.json(response, {
      headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
  } catch (error) {
    console.error('SCIM GET /Users error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}

/**
 * POST /api/scim/v2/Users
 * Create a new user
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
    const body = (await request.json()) as CreateSCIMUserRequest;

    // Validate required fields
    if (!body.userName) {
      return NextResponse.json(
        createBadRequestError('userName is required', 'invalidValue'),
        { status: 400, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    // Check for duplicate userName
    const existing = await findUserByUserName(body.userName, auth.organizationId, auth.configId);
    if (existing) {
      return NextResponse.json(
        createConflictError(`User with userName '${body.userName}' already exists`),
        { status: 409, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
      );
    }

    const user = await createUser(auth.organizationId, auth.configId, body);

    return NextResponse.json(user, {
      status: 201,
      headers: {
        'Content-Type': SCIM_CONTENT_TYPE,
        Location: user.meta.location,
      },
    });
  } catch (error) {
    console.error('SCIM POST /Users error:', error);
    return NextResponse.json(
      createSCIMError(500, `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      { status: 500, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
  }
}
