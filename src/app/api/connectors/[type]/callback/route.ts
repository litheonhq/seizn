/**
 * Connector OAuth Callback
 *
 * Handles OAuth callback from external providers.
 *
 * GET /api/connectors/[type]/callback?code=...&state=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getConnector, type ConnectorType } from '@/lib/connectors/external';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const connectorType = type as ConnectorType;
    const { searchParams } = new URL(request.url);

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=${encodeURIComponent(
          errorDescription || error
        )}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=Missing+code+or+state`
      );
    }

    const supabase = createServerClient();

    // Verify state token
    const { data: stateRecord } = await supabase
      .from('external_oauth_states')
      .select('*')
      .eq('state', state)
      .eq('connector_type', connectorType)
      .single();

    if (!stateRecord) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=Invalid+state`
      );
    }

    // Check if state expired
    if (new Date(stateRecord.expires_at) < new Date()) {
      await supabase.from('external_oauth_states').delete().eq('state', state);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=State+expired`
      );
    }

    // Delete used state
    await supabase.from('external_oauth_states').delete().eq('state', state);

    // Get connector
    const connector = getConnector(connectorType, supabase);
    if (!connector) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=Connector+not+configured`
      );
    }

    // Exchange code for tokens
    const tokens = await connector.handleCallback(code, state);

    // Get connection info
    const connectionInfo = await connector.getConnectionInfo(tokens.accessToken);

    // Check for existing connection
    const { data: existingConnection } = await supabase
      .from('external_connections')
      .select('id')
      .eq('user_id', stateRecord.user_id)
      .eq('connector_type', connectorType)
      .eq('account_id', connectionInfo.accountId)
      .single();

    if (existingConnection) {
      // Update existing connection
      await supabase
        .from('external_connections')
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: tokens.expiresAt?.toISOString(),
          token_scope: tokens.scope,
          account_email: connectionInfo.accountEmail,
          account_name: connectionInfo.accountName,
          account_metadata: connectionInfo.metadata,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id);
    } else {
      // Create new connection
      await supabase.from('external_connections').insert({
        user_id: stateRecord.user_id,
        connector_type: connectorType,
        account_id: connectionInfo.accountId,
        account_email: connectionInfo.accountEmail,
        account_name: connectionInfo.accountName,
        account_metadata: connectionInfo.metadata,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt?.toISOString(),
        token_scope: tokens.scope,
        status: 'active',
        sync_config: {
          auto_sync: true,
          sync_interval_hours: 24,
          include_patterns: [],
          exclude_patterns: [],
        },
      });
    }

    // Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?success=${connectorType}`
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/connections?error=${encodeURIComponent(
        error instanceof Error ? error.message : 'OAuth callback failed'
      )}`
    );
  }
}
