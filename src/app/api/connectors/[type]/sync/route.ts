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
import { verifyCsrf } from '@/lib/csrf';
import {
  getConnector,
  getAvailableConnectors,
  type ConnectorType,
} from '@/lib/connectors/external';
import { logServerError, logServerWarn } from '@/lib/server/logger';

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

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  let connectionIdForCleanup: string | null = null;
  const { type } = await params;
  const connectorType = type as ConnectorType;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const validTypes: ConnectorType[] = ['google_drive', 'notion', 'github'];
    if (!validTypes.includes(connectorType)) {
      return NextResponse.json(
        { error: `Invalid connector type: ${type}` },
        { status: 400 }
      );
    }

    const body = (await request.json()) as SyncRequest;

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

    // Get connection
    const baseConnectionQuery = supabase
      .from('external_connections')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('connector_type', connectorType)
      .eq('status', 'active');

    let connection: Record<string, unknown> | null = null;

    if (body.connectionId) {
      const { data: selected, error: selectedError } = await baseConnectionQuery
        .eq('id', body.connectionId)
        .maybeSingle();

      if (selectedError || !selected) {
        return NextResponse.json(
          { error: 'No active connection found' },
          { status: 404 }
        );
      }

      connection = selected;
    } else {
      const { data: activeConnections, error: connectionError } = await baseConnectionQuery
        .order('updated_at', { ascending: false })
        .limit(2);

      if (connectionError) {
        throw new Error(`Failed to query active connections: ${connectionError.message}`);
      }

      if (!activeConnections || activeConnections.length === 0) {
        return NextResponse.json(
          { error: 'No active connection found' },
          { status: 404 }
        );
      }

      if (activeConnections.length > 1) {
        return NextResponse.json(
          { error: 'Multiple active connections found. Provide connectionId explicitly.' },
          { status: 409 }
        );
      }

      connection = activeConnections[0] as Record<string, unknown>;
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'No active connection found' },
        { status: 404 }
      );
    }

    connectionIdForCleanup = String(connection.id);

    // Get connector
    const connector = getConnector(connectorType, supabase);
    if (!connector) {
      return NextResponse.json(
        { error: `Connector ${type} is unavailable` },
        { status: 400 }
      );
    }

    // Check if token needs refresh
    let accessToken = String(connection.access_token ?? '');
    const tokenExpiresAt = connection.token_expires_at
      ? new Date(String(connection.token_expires_at))
      : null;
    const refreshToken =
      typeof connection.refresh_token === 'string' ? connection.refresh_token : null;

    if (tokenExpiresAt && tokenExpiresAt < new Date()) {
      if (!refreshToken) {
        // Mark connection as needing reauth
        await supabase
          .from('external_connections')
          .update({ status: 'expired' })
          .eq('id', connectionIdForCleanup);

        return NextResponse.json(
          { error: 'Token expired, please reconnect' },
          { status: 401 }
        );
      }

      try {
        const newTokens = await connector.refreshToken(refreshToken);
        accessToken = newTokens.accessToken;

        // Update stored tokens
        await supabase
          .from('external_connections')
          .update({
            access_token: newTokens.accessToken,
            refresh_token: newTokens.refreshToken ?? refreshToken,
            token_expires_at: newTokens.expiresAt?.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connectionIdForCleanup);
      } catch (refreshError) {
        logServerWarn('Connector token refresh failed during sync', refreshError, {
          connectorType,
          connectionId: connectionIdForCleanup,
        });
        await supabase
          .from('external_connections')
          .update({ status: 'expired' })
          .eq('id', connectionIdForCleanup);

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
      .eq('id', connectionIdForCleanup);

    // List items from external source
    const syncConfig =
      connection.sync_config && typeof connection.sync_config === 'object'
        ? (connection.sync_config as Record<string, unknown>)
        : {};
    const requestedLimit = body.options?.limit;
    const normalizedLimit =
      typeof requestedLimit === 'number'
        ? Math.max(1, Math.min(500, Math.floor(requestedLimit)))
        : 100;
    const listOptions = {
      parentId: body.options?.parentId,
      limit: normalizedLimit,
      includePatterns:
        body.options?.includePatterns ?? normalizeStringArray(syncConfig.include_patterns),
      excludePatterns:
        body.options?.excludePatterns ?? normalizeStringArray(syncConfig.exclude_patterns),
      modifiedAfter: body.options?.forceResync
        ? undefined
        : connection.last_sync_completed_at && typeof connection.last_sync_completed_at === 'string'
          ? new Date(connection.last_sync_completed_at)
          : undefined,
    };

    const { items, hasMore } = await connector.listItems(accessToken, listOptions);

    // Sync items to memories
    const syncResult = await connector.syncToMemories(
      items,
      session.user.id,
      connectionIdForCleanup,
      {
        forceResync: body.options?.forceResync,
        tags: [`source:${connectorType}`],
      }
    );

    // Record sync history
    await supabase.from('external_sync_history').insert({
      connection_id: connectionIdForCleanup,
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
      .eq('id', connectionIdForCleanup);

    return NextResponse.json({
      success: true,
      connectionId: connectionIdForCleanup,
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
    logServerError('Connector sync failed', error, {
      connectorType,
      connectionId: connectionIdForCleanup,
    });

    // Try to reset sync status on error
    try {
      if (connectionIdForCleanup) {
        const supabase = createServerClient();
        await supabase
          .from('external_connections')
          .update({ sync_status: 'error' })
          .eq('id', connectionIdForCleanup);
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
