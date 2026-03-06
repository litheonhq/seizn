/**
 * API Route: /api/relay/agents/[id]
 *
 * Get, update, or delete a specific relay agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  type UpdateRelayAgentInput,
  type RelayAgentRow,
  rowToRelayAgent,
} from '@/lib/relay/types';
import { maskAgentKey } from '@/lib/relay/auth';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/relay/agents/[id] - Get a specific relay agent
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await params;

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('relay_agents')
      .select('*')
      .eq('id', id)
      .eq('user_id', authResult.userId)
      .single();

    if (error || !data) {
      return NotFoundErrors.resource('Relay agent', id);
    }

    const agent = rowToRelayAgent(data as RelayAgentRow);

    return NextResponse.json({
      success: true,
      agent: {
        ...agent,
        agentKey: maskAgentKey(agent.agentKey),
      },
    });
  } catch (error) {
    logServerError('Get relay agent error', error);
    return ServerErrors.internal('get_relay_agent');
  }
}

/**
 * PATCH /api/relay/agents/[id] - Update a relay agent
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await params;
    const body = await request.json();
    const input = body as UpdateRelayAgentInput;

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('relay_agents')
      .select('id')
      .eq('id', id)
      .eq('user_id', authResult.userId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('Relay agent', id);
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.length < 2 || input.name.length > 100) {
        return ValidationErrors.invalidField('name', 'must be 2-100 characters');
      }
      updateData.name = input.name;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.endpointUrl !== undefined) {
      updateData.endpoint_url = input.endpointUrl;
    }

    if (input.capabilities !== undefined) {
      updateData.capabilities = input.capabilities;
    }

    if (input.collections !== undefined) {
      updateData.collections = input.collections;
    }

    if (input.connectionMode !== undefined) {
      if (!['callback', 'direct', 'hybrid'].includes(input.connectionMode)) {
        return ValidationErrors.invalidField('connectionMode', 'must be callback, direct, or hybrid');
      }
      updateData.connection_mode = input.connectionMode;
    }

    if (input.status !== undefined) {
      if (!['inactive', 'active', 'maintenance'].includes(input.status)) {
        return ValidationErrors.invalidField('status', 'must be inactive, active, or maintenance');
      }
      updateData.status = input.status;
    }

    if (input.ipWhitelist !== undefined) {
      updateData.ip_whitelist = input.ipWhitelist;
    }

    if (input.tlsRequired !== undefined) {
      updateData.tls_required = input.tlsRequired;
    }

    if (Object.keys(updateData).length === 0) {
      return ValidationErrors.invalidBody('No valid fields to update');
    }

    const { data: updated, error: updateError } = await supabase
      .from('relay_agents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logServerError('Update relay agent error', updateError);
      return ServerErrors.database('update_relay');
    }

    const agent = rowToRelayAgent(updated as RelayAgentRow);

    return NextResponse.json({
      success: true,
      agent: {
        ...agent,
        agentKey: maskAgentKey(agent.agentKey),
      },
    });
  } catch (error) {
    logServerError('Update relay agent error', error);
    return ServerErrors.internal('update_relay_agent');
  }
}

/**
 * DELETE /api/relay/agents/[id] - Delete a relay agent
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await params;

    const supabase = createServerClient();

    // Verify ownership and get name for response
    const { data: existing } = await supabase
      .from('relay_agents')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', authResult.userId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('Relay agent', id);
    }

    const { error: deleteError } = await supabase
      .from('relay_agents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logServerError('Delete relay agent error', deleteError);
      return ServerErrors.database('delete_relay');
    }

    return NextResponse.json({
      success: true,
      message: `Relay agent "${existing.name}" deleted`,
      deletedId: id,
    });
  } catch (error) {
    logServerError('Delete relay agent error', error);
    return ServerErrors.internal('delete_relay_agent');
  }
}
