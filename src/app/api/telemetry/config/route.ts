/**
 * Telemetry Configuration API
 *
 * Returns OTLP exporter configuration for client-side tracing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization context
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(id, name)')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    // Return OTLP configuration
    // In production, this could be customized per organization
    const config = {
      otlp: {
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
        protocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf',
        headers: {
          // Organization-specific headers for routing/filtering
          'x-seizn-org-id': membership.organization_id,
        },
      },
      service: {
        name: 'seizn-client',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      },
      resource: {
        'service.name': 'seizn-client',
        'service.version': process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
        'seizn.organization.id': membership.organization_id,
      },
      contentCapture: {
        // Default to hash-only for privacy
        mode: 'hash' as const,
        hashAlgorithm: 'sha256' as const,
      },
      sampling: {
        // Sample rate for traces (1.0 = 100%)
        rate: process.env.OTEL_TRACES_SAMPLER_ARG
          ? parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG)
          : 1.0,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Telemetry config error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
