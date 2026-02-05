/**
 * Connector Sync
 *
 * Triggers manual sync from external source.
 *
 * POST /api/connectors/[type]/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { getConnector, type ConnectorType } from '@/lib/connectors/external';

interface SyncRequest {
  connectionId?: string;
  options?: {
    forceResync?: boolean;
    parentId?: string;
    limit?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
  };
}

export async function POST(
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
    const body = (await request.json()) as SyncRequest;

    const supabase = createServerClient();

    // Get connection
    let connectionQuery = supabase
      .from('external_connections')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('connector_type', connectorType)
      .eq('status', 'active');

    if (body.connectionId) {
      connectionQuery = connectionQuery.eq('id', body.connectionId);
    }

    const { data: connection, error: connectionError } = await connectionQuery.single();

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: 'No active connection found' },
        { status: 404 }
      );
    }

    // Get connector
    const connector = getConnector(connectorType, supabase);
    if (!connector) {
      return NextResponse.json(
        { error: `Connector ${type} not configured` },
        { status: 501 }
      );
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      if (!connection.refresh_token) {
        // Mark connection as needing reauth
        await supabase
          .from('external_connections')
          .update({ status: 'expired' })
          .eq('id', connection.id);

        return NextResponse.json(
          { error: 'Token expired, please reconnect' },
          { status: 401 }
        );
      }

      try {
        const newTokens = await connector.refreshToken(connection.refresh_token);
        accessToken = newTokens.accessToken;

        // Update stored tokens
        await supabase
          .from('external_connections')
          .update({
            access_token: newTokens.accessToken,
            refresh_token: newTokens.refreshToken ?? connection.refresh_token,
            token_expires_at: newTokens.expiresAt?.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        await supabase
          .from('external_connections')
          .update({ status: 'expired' })
          .eq('id', connection.id);

        return NextResponse.json(
          { error: 'Token refresh failed, please reconnect' },
          { status: 401 }
        );
      }
    }

    // Update connection to syncing status
    await supabase
      .from('external_connections')
      .update({
        sync_status: 'syncing',
        sync_started_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    // List items from external source
    const syncConfig = connection.sync_config || {};
    const listOptions = {
      parentId: body.options?.parentId,
      limit: body.options?.limit ?? 100,
      includePatterns: body.options?.includePatterns ?? syncConfig.include_patterns,
      excludePatterns: body.options?.excludePatterns ?? syncConfig.exclude_patterns,
      modifiedAfter: body.options?.forceResync
        ? undefined
        : connection.last_sync_completed_at
          ? new Date(connection.last_sync_completed_at)
          : undefined,
    };

    const { items, hasMore } = await connector.listItems(accessToken, listOptions);

    // Sync items to memories
    const syncResult = await connector.syncToMemories(
      items,
      session.user.id,
      connection.id,
      {
        forceResync: body.options?.forceResync,
        tags: [`source:${connectorType}`],
      }
    );

    // Record sync history
    await supabase.from('external_sync_history').insert({
      connection_id: connection.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: syncResult.failed > 0 ? 'partial' : 'success',
      items_synced: syncResult.created + syncResult.updated,
      items_created: syncResult.created,
      items_updated: syncResult.updated,
      items_skipped: syncResult.skipped,
      items_failed: syncResult.failed,
      error_details: syncResult.errors.length > 0 ? syncResult.errors : null,
    });

    // Update connection status
    await supabase
      .from('external_connections')
      .update({
        sync_status: 'idle',
        last_sync_completed_at: new Date().toISOString(),
        last_sync_result: {
          created: syncResult.created,
          updated: syncResult.updated,
          skipped: syncResult.skipped,
          failed: syncResult.failed,
          hasMore,
        },
      })
      .eq('id', connection.id);

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      result: {
        created: syncResult.created,
        updated: syncResult.updated,
        skipped: syncResult.skipped,
        failed: syncResult.failed,
        memoryIds: syncResult.memoryIds,
        hasMore,
      },
      errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
    });
  } catch (error) {
    console.error('Sync error:', error);

    // Try to reset sync status on error
    try {
      const supabase = createServerClient();
      const { type } = await params;
      const session = await auth();
      if (session?.user?.id) {
        await supabase
          .from('external_connections')
          .update({ sync_status: 'error' })
          .eq('user_id', session.user.id)
          .eq('connector_type', type);
      }
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
