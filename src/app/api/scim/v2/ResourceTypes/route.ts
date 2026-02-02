/**
 * SCIM 2.0 Resource Types Endpoint
 *
 * GET /api/scim/v2/ResourceTypes
 *
 * RFC 7644 Section 4 - Resource type discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { getResourceTypes } from '@/lib/scim/schemas';
import { SCIM_SCHEMAS } from '@/types/scim';

export async function GET(_request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';
  const resourceTypes = getResourceTypes(baseUrl);

  const response = {
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: resourceTypes.length,
    startIndex: 1,
    itemsPerPage: resourceTypes.length,
    Resources: resourceTypes,
  };

  return NextResponse.json(response, {
    headers: {
      'Content-Type': 'application/scim+json',
    },
  });
}
