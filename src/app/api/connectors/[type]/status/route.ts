/**
 * Connector Status
 *
 * Get connection and sync status for a connector type.
 *
 * GET /api/connectors/[type]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { getConnector, type ConnectorType } from '@/lib/connectors/external';
import { verifyCsrfToken } from '@/lib/csrf';
import { logServerError, logServerWarn } from '@/lib/server/logger';

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

    const supabase = createServerClient();

    // Get all connections for this type
    const { data: connections, error: connectionsError } = await supabase
      .from('external_connections')
      .select(
        `
        id,
        account_id,
        account_email,
        account_name,
        account_metadata,
        status,
        sync_status,
        sync_config,
        last_sync_completed_at,
        last_sync_result,
        created_at,
        updated_at
      `
      )
      .eq('user_id', session.user.id)
      .eq('connector_type', connectorType)
      .order('created_at', { ascending: false });

    if (connectionsError) {
      throw connectionsError;
    }

    // Get sync stats for each connection
    const connectionsWithStats = await Promise.all(
      (connections ?? []).map(async (conn) => {
        // Get item count
        const { count: itemCount } = await supabase
          .from('external_sync_items')
          .select('*', { count: 'exact', head: true })
          .eq('connection_id', conn.id);

        // Get recent sync history
        const { data: recentSyncs } = await supabase
          .from('external_sync_history')
          .select('*')
          .eq('connection_id', conn.id)
          .order('completed_at', { ascending: false })
          .limit(5);

        return {
          ...conn,
          stats: {
            itemCount: itemCount ?? 0,
            recentSyncs: recentSyncs ?? [],
          },
        };
      })
    );

    // Check if connector is configured
    const connector = getConnector(connectorType, supabase);
    const isConfigured = connector !== null;

    return NextResponse.json({
      connectorType,
      isConfigured,
      connections: connectionsWithStats,
      totalConnections: connections?.length ?? 0,
    });
  } catch (error) {
    logServerError('Connector status lookup failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/connectors/[type]/status
 *
 * Disconnect (revoke) a connection
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const csrfErr = verifyCsrfToken(request);
    if (csrfErr) return csrfErr;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await params;
    const connectorType = type as ConnectorType;
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get connection
    const { data: connection, error: connError } = await supabase
      .from('external_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', session.user.id)
      .eq('connector_type', connectorType)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Try to revoke token with provider
    const connector = getConnector(connectorType, supabase);
    if (connector && connection.access_token) {
      try {
        await connector.revokeToken(connection.access_token);
      } catch (revokeError) {
        // Log but continue - we still want to remove local connection
        logServerWarn('Connector token revoke failed during disconnect', revokeError, {
          connectorType,
        });
      }
    }

    // Delete sync items and history (cascade should handle this, but be explicit)
    await supabase
      .from('external_sync_items')
      .delete()
      .eq('connection_id', connectionId);

    await supabase
      .from('external_sync_history')
      .delete()
      .eq('connection_id', connectionId);

    // Delete connection
    await supabase.from('external_connections').delete().eq('id', connectionId);

    return NextResponse.json({
      success: true,
      message: 'Connection removed',
    });
  } catch (error) {
    logServerError('Connector disconnect failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
