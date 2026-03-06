/**
 * Connectors List API
 *
 * Lists available external connectors and their status.
 *
 * GET /api/connectors
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { getAvailableConnectors, type ConnectorType } from '@/lib/connectors/external';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { logServerError } from '@/lib/server/logger';

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return AuthErrors.unauthorized('connectors');
    }

    const supabase = createServerClient();

    // Get available connectors
    const availableConnectors = getAvailableConnectors();

    // Get user's existing connections
    const { data: connections } = await supabase
      .from('external_connections')
      .select('connector_type, status, account_email, account_name')
      .eq('user_id', session.user.id);

    // Map connections by type
    const connectionsByType = new Map<ConnectorType, typeof connections>();
    for (const conn of connections ?? []) {
      const type = conn.connector_type as ConnectorType;
      if (!connectionsByType.has(type)) {
        connectionsByType.set(type, []);
      }
      connectionsByType.get(type)!.push(conn);
    }

    // Combine connector info with connection status
    const connectors = availableConnectors.map((connector) => ({
      ...connector,
      connections: connectionsByType.get(connector.type) ?? [],
      hasActiveConnection: (connectionsByType.get(connector.type) ?? []).some(
        (c) => c.status === 'active'
      ),
    }));

    return NextResponse.json({
      connectors,
      totalConnections: connections?.length ?? 0,
    });
  } catch (error) {
    logServerError('List connectors failed', error);
    return ServerErrors.internal('list_connectors');
  }
}
