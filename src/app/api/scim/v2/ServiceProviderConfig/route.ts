/**
 * SCIM 2.0 Service Provider Configuration Endpoint
 *
 * GET /api/scim/v2/ServiceProviderConfig
 *
 * RFC 7644 Section 4 - Service provider configuration discovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceProviderConfig } from '@/lib/scim/schemas';

export async function GET(_request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
  const config = getServiceProviderConfig(baseUrl);

  return NextResponse.json(config, {
    headers: {
      'Content-Type': 'application/scim+json',
    },
  });
}
