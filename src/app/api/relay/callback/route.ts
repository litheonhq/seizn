/**
 * API Route: /api/relay/callback
 *
 * Callback endpoint for relay agents to submit search results.
 * Used in callback mode where the relay pushes results to Seizn.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  type RelayCallbackRequest,
  type RelayProtocolResponse,
  validateRelayResponse,
} from '@/lib/relay/protocol';
import { verifyCallbackSignature, verifyCallbackToken } from '@/lib/relay/auth';
import { type RelayAgentRow } from '@/lib/relay/types';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/relay/callback - Receive callback from relay agent
 *
 * The relay agent calls this endpoint to submit search results
 * for a pending request.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.requestId || typeof body.requestId !== 'string') {
      return ValidationErrors.missingField('requestId');
    }

    if (!body.agentKey || typeof body.agentKey !== 'string') {
      return ValidationErrors.missingField('agentKey');
    }

    if (!body.response) {
      return ValidationErrors.missingField('response');
    }

    if (!body.signature || typeof body.signature !== 'string') {
      return ValidationErrors.missingField('signature');
    }

    const callbackRequest = body as RelayCallbackRequest;

    const supabase = createServerClient();

    // Find the relay agent by key hash
    const { hashAgentKey } = await import('@/lib/relay/auth');
    const keyHash = hashAgentKey(callbackRequest.agentKey);

    const { data: relayData, error: relayError } = await supabase
      .from('relay_agents')
      .select('*')
      .eq('agent_key', keyHash)
      .single();

    if (relayError || !relayData) {
      return NextResponse.json(
        {
          error: {
            error_code: 'AUTH_INVALID_KEY',
            message: 'Invalid agent key',
          },
        },
        { status: 401 }
      );
    }

    const relay = relayData as RelayAgentRow;

    // Verify signature
    if (!verifyCallbackSignature(callbackRequest, callbackRequest.agentKey)) {
      return NextResponse.json(
        {
          error: {
            error_code: 'AUTH_INVALID_SIGNATURE',
            message: 'Invalid request signature',
          },
        },
        { status: 401 }
      );
    }

    // Find the pending callback
    const { data: pendingCallback, error: callbackError } = await supabase
      .from('relay_pending_callbacks')
      .select('*')
      .eq('request_id', callbackRequest.requestId)
      .eq('relay_id', relay.id)
      .eq('status', 'pending')
      .single();

    if (callbackError || !pendingCallback) {
      return NextResponse.json(
        {
          error: {
            error_code: 'REQUEST_NOT_FOUND',
            message: 'No pending request found for this request ID',
          },
        },
        { status: 404 }
      );
    }

    // Verify callback token if present in payload
    const payload = pendingCallback.payload as Record<string, unknown>;
    if (payload.callbackToken) {
      const tokenResult = verifyCallbackToken(
        payload.callbackToken as string,
        callbackRequest.requestId,
        callbackRequest.agentKey
      );

      if (!tokenResult.valid) {
        if (tokenResult.expired) {
          return NextResponse.json(
            {
              error: {
                error_code: 'TOKEN_EXPIRED',
                message: 'Callback token has expired',
              },
            },
            { status: 401 }
          );
        }
        return NextResponse.json(
          {
            error: {
              error_code: 'INVALID_TOKEN',
              message: 'Invalid callback token',
            },
          },
          { status: 401 }
        );
      }
    }

    // Validate response format
    if (!validateRelayResponse(callbackRequest.response)) {
      return ValidationErrors.invalidField('response', 'Invalid response format');
    }

    const response = callbackRequest.response as RelayProtocolResponse;
    const latencyMs = Date.now() - new Date(pendingCallback.created_at).getTime();

    // Update the relay request record
    const requestStatus = response.status === 'success' ? 'completed' : 'error';
    const resultPayload = response.payload as { results?: unknown[]; totalFound?: number } | undefined;

    await supabase.from('relay_requests').upsert({
      relay_id: relay.id,
      request_id: callbackRequest.requestId,
      status: requestStatus,
      result_count: resultPayload?.results?.length ?? resultPayload?.totalFound ?? 0,
      latency_ms: latencyMs,
      error_message: response.error?.message ?? null,
      completed_at: new Date().toISOString(),
    });

    // Mark the pending callback as received
    await supabase
      .from('relay_pending_callbacks')
      .update({ status: 'received' })
      .eq('id', pendingCallback.id);

    // Update relay heartbeat
    await supabase
      .from('relay_agents')
      .update({
        last_heartbeat: new Date().toISOString(),
        status: 'active',
        last_error: response.error?.message ?? null,
      })
      .eq('id', relay.id);

    return NextResponse.json({
      received: true,
      requestId: callbackRequest.requestId,
      processedIn: Date.now() - startTime,
      instructions: {
        cancel: false,
        heartbeatIntervalMs: 30000, // 30 seconds
      },
    });
  } catch (error) {
    logServerError('Relay callback error', error);
    return ServerErrors.internal('relay_callback');
  }
}
