import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { getFederationService, type AnyConnectorConfig } from '@/lib/connectors';

/**
 * GET /api/federated - List registered connectors
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const federation = getFederationService();
    const connectors = federation.listConnectors();

    return NextResponse.json({
      success: true,
      connectors,
    });
  } catch (error) {
    console.error('List connectors error:', error);
    return ServerErrors.internal('list_connectors');
  }
}

/**
 * POST /api/federated - Register a new connector or perform federated search
 *
 * Request body can be either:
 * 1. { action: "register", config: ConnectorConfig }
 * 2. { action: "search", query: string, embedding?: number[], ... }
 * 3. { action: "health" }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { action } = body;

    const federation = getFederationService();

    switch (action) {
      case 'register': {
        const { config } = body as { config: AnyConnectorConfig };

        if (!config || !config.type || !config.name) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Invalid connector config' } },
            { status: 400 }
          );
        }

        await federation.addConnector(config);

        return NextResponse.json({
          success: true,
          message: `Connector ${config.name} registered successfully`,
          connector: {
            name: config.name,
            type: config.type,
          },
        });
      }

      case 'unregister': {
        const { name } = body;

        if (!name) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Connector name required' } },
            { status: 400 }
          );
        }

        await federation.removeConnector(name);

        return NextResponse.json({
          success: true,
          message: `Connector ${name} removed`,
        });
      }

      case 'search': {
        const { query, embedding, topK, sources, mergeStrategy, deduplicateBy, filter, timeout_ms } =
          body;

        if (!query && !embedding) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Query or embedding required' } },
            { status: 400 }
          );
        }

        const result = await federation.search({
          query,
          embedding,
          topK: topK || 10,
          sources,
          mergeStrategy: mergeStrategy || 'interleave',
          deduplicateBy,
          filter,
          timeout_ms: timeout_ms || 5000,
        });

        return NextResponse.json({
          success: true,
          ...result,
        });
      }

      case 'health': {
        const health = await federation.healthCheck();

        return NextResponse.json({
          success: true,
          connectors: health,
          overall: Object.values(health).every((h) => h.healthy),
        });
      }

      default:
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid action. Use: register, unregister, search, or health',
            },
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Federated API error:', error);
    return ServerErrors.internal('federated_api');
  }
}

/**
 * DELETE /api/federated - Disconnect all connectors
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const federation = getFederationService();
    await federation.disconnectAll();

    return NextResponse.json({
      success: true,
      message: 'All connectors disconnected',
    });
  } catch (error) {
    console.error('Disconnect connectors error:', error);
    return ServerErrors.internal('disconnect_connectors');
  }
}
