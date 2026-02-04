/**
 * SCIM 2.0 Schemas Endpoint
 *
 * GET /api/scim/v2/Schemas
 *
 * RFC 7644 Section 4 - Schema discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchemas } from '@/lib/scim/schemas';
import { SCIM_SCHEMAS } from '@/types/scim';

export async function GET(_request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
  const schemas = getSchemas(baseUrl);

  const response = {
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults: schemas.length,
    startIndex: 1,
    itemsPerPage: schemas.length,
    Resources: schemas,
  };

  return NextResponse.json(response, {
    headers: {
      'Content-Type': 'application/scim+json',
    },
  });
}
