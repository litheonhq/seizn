/**
 * Auto-Eval Event Emitter
 *
 * Handles emission and processing of evaluation trigger events
 * when policies or model configurations change.
 */

import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import type {
  EvalTriggerEvent,
  EvalTriggerType,
  EvalTriggerEventRow,
} from './types';

// ============================================
// Event Emission
// ============================================

interface EmitEventParams {
  type: EvalTriggerType;
  source: 'policy_pack' | 'opa_policy' | 'firewall' | 'model_config';
  organizationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Emit an evaluation trigger event
 * This persists the event to the database for async processing
 */
export async function emitEvalTrigger(params: EmitEventParams): Promise<string> {
  const supabase = await createClient();

  const event: Omit<EvalTriggerEventRow, 'created_at'> = {
    id: uuidv4(),
    type: params.type,
    source: params.source,
    organization_id: params.organizationId,
    user_id: params.userId,
    metadata: {
      ...params.metadata,
      emittedAt: new Date().toISOString(),
    },
    processed: false,
    processed_at: undefined,
  };

  const { error } = await supabase.from('auto_eval_triggers').insert(event);

  if (error) {
    console.error('[AutoEval] Failed to emit trigger event:', error);
    throw new Error(`Failed to emit eval trigger: ${error.message}`);
  }

  console.log(`[AutoEval] Emitted trigger event: ${params.type} (${event.id})`);
  return event.id;
}

// ============================================
// Convenience Emitters
// ============================================

export async function emitPolicyVersionCreated(params: {
  organizationId?: string;
  userId?: string;
  packId: string;
  versionId: string;
  version: string;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'policy_version_created',
    source: 'policy_pack',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      packId: params.packId,
      versionId: params.versionId,
      version: params.version,
    },
  });
}

export async function emitPolicyVersionPublished(params: {
  organizationId?: string;
  userId?: string;
  packId: string;
  versionId: string;
  version: string;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'policy_version_published',
    source: 'policy_pack',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      packId: params.packId,
      versionId: params.versionId,
      version: params.version,
    },
  });
}

export async function emitPolicyInstalled(params: {
  organizationId: string;
  userId?: string;
  packId: string;
  installationId: string;
  versionId: string;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'policy_installed',
    source: 'policy_pack',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      packId: params.packId,
      installationId: params.installationId,
      versionId: params.versionId,
    },
  });
}

export async function emitPolicyUpdated(params: {
  organizationId: string;
  userId?: string;
  packId: string;
  installationId: string;
  previousConfig?: Record<string, unknown>;
  newConfig?: Record<string, unknown>;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'policy_updated',
    source: 'policy_pack',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      packId: params.packId,
      installationId: params.installationId,
      previousConfig: params.previousConfig,
      newConfig: params.newConfig,
    },
  });
}

export async function emitFirewallPatternAdded(params: {
  organizationId?: string;
  userId?: string;
  patternId: string;
  patternName: string;
  category: string;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'firewall_pattern_added',
    source: 'firewall',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      patternId: params.patternId,
      patternName: params.patternName,
      category: params.category,
    },
  });
}

export async function emitFirewallConfigChanged(params: {
  organizationId: string;
  userId?: string;
  policyId: string;
  previousConfig?: Record<string, unknown>;
  newConfig?: Record<string, unknown>;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'firewall_config_changed',
    source: 'firewall',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      policyId: params.policyId,
      previousConfig: params.previousConfig,
      newConfig: params.newConfig,
    },
  });
}

export async function emitModelConfigChanged(params: {
  organizationId: string;
  userId?: string;
  configKey: string;
  previousValue?: unknown;
  newValue?: unknown;
}): Promise<string> {
  return emitEvalTrigger({
    type: 'model_config_changed',
    source: 'model_config',
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: {
      configKey: params.configKey,
      previousValue: params.previousValue,
      newValue: params.newValue,
    },
  });
}

// ============================================
// Event Retrieval
// ============================================

export async function getPendingTriggers(limit = 10): Promise<EvalTriggerEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('auto_eval_triggers')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[AutoEval] Failed to get pending triggers:', error);
    throw new Error(`Failed to get pending triggers: ${error.message}`);
  }

  return (data || []).map(rowToEvent);
}

export async function markTriggerProcessed(triggerId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('auto_eval_triggers')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
    })
    .eq('id', triggerId);

  if (error) {
    console.error('[AutoEval] Failed to mark trigger as processed:', error);
    throw new Error(`Failed to mark trigger processed: ${error.message}`);
  }
}

export async function getTriggerById(triggerId: string): Promise<EvalTriggerEvent | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('auto_eval_triggers')
    .select('*')
    .eq('id', triggerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get trigger: ${error.message}`);
  }

  return rowToEvent(data);
}

// ============================================
// Helpers
// ============================================

function rowToEvent(row: EvalTriggerEventRow): EvalTriggerEvent {
  return {
    id: row.id,
    type: row.type,
    timestamp: row.created_at,
    source: row.source as EvalTriggerEvent['source'],
    metadata: {
      organizationId: row.organization_id,
      userId: row.user_id,
      ...row.metadata,
    },
  };
}
