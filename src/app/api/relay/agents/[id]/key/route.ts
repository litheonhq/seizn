/**
 * API Route: /api/relay/agents/[id]/key
 *
 * Regenerate the agent key for a relay agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { generateAgentKey, hashAgentKey } from '@/lib/relay/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/relay/agents/[id]/key - Regenerate agent key
 *
 * This invalidates the old key and generates a new one.
 * The relay agent will need to be reconfigured with the new key.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await params;

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('relay_agents')
      .select('id, name, status')
      .eq('id', id)
      .eq('user_id', authResult.userId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('Relay agent', id);
    }

    // Generate new key
    const newAgentKey = generateAgentKey();
    const newAgentKeyHash = hashAgentKey(newAgentKey);

    // Update the agent key and set status to inactive (needs reconfiguration)
    const { error: updateError } = await supabase
      .from('relay_agents')
      .update({
        agent_key: newAgentKeyHash,
        status: 'inactive',
        last_heartbeat: null,
        last_error: null,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Regenerate agent key error:', updateError);
      return ServerErrors.database('regenerate_key');
    }

    return NextResponse.json({
      success: true,
      agentKey: newAgentKey,
      message: `New agent key generated for "${existing.name}". Save this key - it will not be shown again. The relay agent status has been set to inactive and needs to be reconfigured.`,
      previousStatus: existing.status,
    });
  } catch (error) {
    console.error('Regenerate agent key error:', error);
    return ServerErrors.internal('regenerate_agent_key');
  }
}
