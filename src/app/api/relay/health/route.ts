/**
 * API Route: /api/relay/health
 *
 * Aggregate health status for all relay agents.
 * Also serves as the heartbeat endpoint for relay agents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { checkAllRelayHealth, recordHeartbeat } from '@/lib/relay/health';
import { hashAgentKey } from '@/lib/relay/auth';

/**
 * GET /api/relay/health - Get aggregate health status
 *
 * Returns health status for all relay agents owned by the user.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';

    const health = await checkAllRelayHealth(authResult.userId, detailed);

    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error) {
    console.error('Get relay health error:', error);
    return ServerErrors.internal('get_relay_health');
  }
}

/**
 * POST /api/relay/health - Relay agent heartbeat
 *
 * Called by relay agents to report their health status.
 * Authenticates using the agent key (not API key).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate agent key
    const agentKey = body.agentKey || request.headers.get('x-relay-agent-key');
    if (!agentKey || typeof agentKey !== 'string') {
      return ValidationErrors.missingField('agentKey');
    }

    const version = body.version as string | undefined;
    const capabilities = body.capabilities as string[] | undefined;
    const collections = body.collections as string[] | undefined;

    // Record heartbeat
    const result = await recordHeartbeat(hashAgentKey(agentKey), version);

    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            error_code: 'AUTH_INVALID_KEY',
            message: 'Invalid or unknown agent key',
          },
        },
        { status: 401 }
      );
    }

    // If capabilities or collections changed, update them
    if (capabilities || collections) {
      const supabase = createServerClient();
      const updateData: Record<string, unknown> = {};

      if (capabilities) {
        updateData.capabilities = capabilities;
      }
      if (collections) {
        updateData.collections = collections;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('relay_agents')
          .update(updateData)
          .eq('id', result.relayId);
      }
    }

    return NextResponse.json({
      success: true,
      relayId: result.relayId,
      status: result.status,
      instructions: {
        heartbeatIntervalMs: 30000, // 30 seconds
        pendingRequests: await getPendingRequestCount(result.relayId!),
      },
    });
  } catch (error) {
    console.error('Relay heartbeat error:', error);
    return ServerErrors.internal('relay_heartbeat');
  }
}

/**
 * Get count of pending requests for a relay
 */
async function getPendingRequestCount(relayId: string): Promise<number> {
  const supabase = createServerClient();

  const { count, error } = await supabase
    .from('relay_pending_callbacks')
    .select('*', { count: 'exact', head: true })
    .eq('relay_id', relayId)
    .eq('status', 'pending');

  if (error) {
    return 0;
  }

  return count ?? 0;
}
