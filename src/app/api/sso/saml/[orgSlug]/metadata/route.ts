/**
 * SAML SP Metadata Endpoint
 *
 * GET /api/sso/saml/[orgSlug]/metadata
 *
 * Returns the SAML Service Provider metadata XML for the organization.
 * This is used by IdPs to configure the SAML connection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSSOConnections } from '@/lib/sso';
import { generateFullSPMetadataXML } from '@/lib/sso/saml-provider';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ orgSlug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const supabase = createServerClient();

    // Get organization by slug
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return new NextResponse('Organization not found', { status: 404 });
    }

    // Get active SSO connection
    const connections = await getSSOConnections(org.id);
    const activeConnection = connections.find(
      (c) => c.status === 'active' || c.status === 'testing'
    );

    if (!activeConnection) {
      return new NextResponse('SSO not configured for this organization', {
        status: 404,
      });
    }

    // Generate SP metadata XML
    const metadataXml = generateFullSPMetadataXML(activeConnection);

    return new NextResponse(metadataXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `inline; filename="seizn-${orgSlug}-sp-metadata.xml"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    logServerError('SAML metadata error', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
