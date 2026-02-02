/**
 * SCIM 2.0 Resource Type by ID Endpoint
 *
 * GET /api/scim/v2/ResourceTypes/:id
 *
 * RFC 7644 Section 4 - Individual resource type retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { getResourceTypes } from '@/lib/scim/schemas';
import { createNotFoundError } from '@/lib/scim/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  // Find the resource type
  const resourceTypes = getResourceTypes(baseUrl);
  const resourceType = resourceTypes.find((r) => r.id === id);

  if (!resourceType) {
    return NextResponse.json(createNotFoundError('ResourceType', id), {
      status: 404,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }

  return NextResponse.json(resourceType, {
    headers: {
      'Content-Type': 'application/scim+json',
    },
  });
}
