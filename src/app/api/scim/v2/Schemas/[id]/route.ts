/**
 * SCIM 2.0 Schema by ID Endpoint
 *
 * GET /api/scim/v2/Schemas/:id
 *
 * RFC 7644 Section 4 - Individual schema retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchemas } from '@/lib/scim/schemas';
import { createNotFoundError } from '@/lib/scim/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';

  // Decode the ID (it's a URN which may be URL encoded)
  const decodedId = decodeURIComponent(id);

  // Find the schema
  const schemas = getSchemas(baseUrl);
  const schema = schemas.find((s) => s.id === decodedId);

  if (!schema) {
    return NextResponse.json(createNotFoundError('Schema', decodedId), {
      status: 404,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }

  return NextResponse.json(schema, {
    headers: {
      'Content-Type': 'application/scim+json',
    },
  });
}
