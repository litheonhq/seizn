/**
 * API Route: /api/relay/agents
 *
 * Manage relay agents for edge federated search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  type CreateRelayAgentInput,
  type RelayAgentRow,
  rowToRelayAgent,
} from '@/lib/relay/types';
import { generateAgentKey, hashAgentKey, maskAgentKey } from '@/lib/relay/auth';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/relay/agents - List all relay agents
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const collectionId = searchParams.get('collection_id');

    let query = supabase
      .from('relay_agents')
      .select('*')
      .eq('user_id', authResult.userId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (collectionId) {
      query = query.contains('collections', [collectionId]);
    }

    const { data, error } = await query;

    if (error) {
      logServerError('List relay agents error', error);
      return ServerErrors.database('list_relays');
    }

    const agents = (data || []).map((row: RelayAgentRow) => {
      const agent = rowToRelayAgent(row);
      // Mask the agent key in list response
      return {
        ...agent,
        agentKey: maskAgentKey(agent.agentKey),
      };
    });

    return NextResponse.json({
      success: true,
      agents,
      count: agents.length,
    });
  } catch (error) {
    logServerError('List relay agents error', error);
    return ServerErrors.internal('list_relay_agents');
  }
}

/**
 * POST /api/relay/agents - Create a new relay agent
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const input = body as CreateRelayAgentInput;

    // Validation
    if (!input.name || typeof input.name !== 'string') {
      return ValidationErrors.missingField('name');
    }

    if (input.name.length < 2 || input.name.length > 100) {
      return ValidationErrors.invalidField('name', 'must be 2-100 characters');
    }

    // Generate agent key
    const agentKey = generateAgentKey();
    const agentKeyHash = hashAgentKey(agentKey);

    const supabase = createServerClient();

    // Check for duplicate name
    const { data: existing } = await supabase
      .from('relay_agents')
      .select('id')
      .eq('user_id', authResult.userId)
      .eq('name', input.name)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: {
            error_code: 'DUPLICATE_ENTRY',
            message: `Relay agent with name "${input.name}" already exists`,
          },
        },
        { status: 409 }
      );
    }

    // Create relay agent
    const { data: created, error: createError } = await supabase
      .from('relay_agents')
      .insert({
        user_id: authResult.userId,
        org_id: authResult.orgId ?? null,
        name: input.name,
        description: input.description ?? null,
        agent_key: agentKeyHash,
        endpoint_url: input.endpointUrl ?? null,
        capabilities: input.capabilities ?? ['retrieve'],
        collections: input.collections ?? [],
        connection_mode: input.connectionMode ?? 'callback',
        ip_whitelist: input.ipWhitelist ?? null,
        tls_required: input.tlsRequired ?? true,
        status: 'inactive',
      })
      .select()
      .single();

    if (createError) {
      logServerError('Create relay agent error', createError);
      return ServerErrors.database('create_relay');
    }

    const agent = rowToRelayAgent(created as RelayAgentRow);

    return NextResponse.json(
      {
        success: true,
        agent: {
          ...agent,
          // Return the actual key only on creation
          agentKey: agentKey,
        },
        message: 'Relay agent created. Save the agent key - it will not be shown again.',
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError('Create relay agent error', error);
    return ServerErrors.internal('create_relay_agent');
  }
}
