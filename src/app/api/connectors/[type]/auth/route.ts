/**
 * Connector OAuth Start
 *
 * Initiates OAuth flow for external connectors.
 *
 * GET /api/connectors/[type]/auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import {
  getConnector,
  getAvailableConnectors,
  type ConnectorType,
} from '@/lib/connectors/external';
import { randomBytes } from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await params;
    const connectorType = type as ConnectorType;

    // Validate connector type
    const validTypes: ConnectorType[] = ['google_drive', 'notion', 'github'];
    if (!validTypes.includes(connectorType)) {
      return NextResponse.json(
        { error: `Invalid connector type: ${type}` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const connectorMeta = getAvailableConnectors().find(
      (candidate) => candidate.type === connectorType
    );
    if (!connectorMeta?.configured) {
      return NextResponse.json(
        { error: `Connector ${type} is not configured. Missing OAuth credentials.` },
        { status: 400 }
      );
    }

    const connector = getConnector(connectorType, supabase);

    if (!connector) {
      return NextResponse.json(
        { error: `Connector ${type} is unavailable` },
        { status: 400 }
      );
    }

    // Generate state token for CSRF protection
    const state = randomBytes(32).toString('hex');

    // Store state in database for verification
    const { error: stateError } = await supabase.from('external_oauth_states').insert({
      state,
      user_id: session.user.id,
      connector_type: connectorType,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    });
    if (stateError) {
      throw new Error(`Failed to persist OAuth state: ${stateError.message}`);
    }

    // Get OAuth URL
    const authUrl = connector.getAuthUrl(state, session.user.id);

    // Redirect to OAuth provider
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth start error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OAuth start failed' },
      { status: 500 }
    );
  }
}
