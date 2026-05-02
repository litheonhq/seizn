import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import type { Assignment, Experiment, ExperimentArm } from './types';
import { pickBanditArm } from './bandit';

function stableUnitFloat(input: string): number {
  const hex = createHash('sha256').update(input).digest('hex').slice(0, 16);
  const int = Number.parseInt(hex, 16);
  return (int % 10_000_000) / 10_000_000;
}

function pickWeighted(arms: ExperimentArm[], r: number): ExperimentArm {
  const total = arms.reduce((s, a) => s + (a.weight ?? 0), 0);
  if (total <= 0) return arms[0];

  let acc = 0;
  for (const a of arms) {
    acc += (a.weight ?? 0) / total;
    if (r <= acc) return a;
  }
  return arms[arms.length - 1];
}

export async function getLatestRunningExperiment(userId: string): Promise<Experiment | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fall_experiments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'running')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as Experiment | null;
}

export async function assignExperimentArm(params: {
  userId: string;
  apiKeyId?: string;
  experimentId: string;
  requestId?: string;
  traceId?: string;
}): Promise<Assignment | null> {
  const supabase = createServerClient();

  const { data: exp, error: expErr } = await supabase
    .from('fall_experiments')
    .select('*')
    .eq('id', params.experimentId)
    .eq('user_id', params.userId)
    .eq('status', 'running')
    .maybeSingle();

  if (expErr) throw expErr;
  if (!exp) return null;

  const { data: arms, error: armsErr } = await supabase
    .from('fall_experiment_arms')
    .select('*')
    .eq('experiment_id', params.experimentId);

  if (armsErr) throw armsErr;
  const armRows = (arms ?? []) as ExperimentArm[];
  if (armRows.length === 0) return null;

  let chosen: ExperimentArm;

  if (exp.allocation_strategy === 'bandit') {
    const { arm } = await pickBanditArm({ experimentId: params.experimentId });
    chosen = arm;
  } else {
    // A/B: stable hash allocation by unit
    const unitKey =
      exp.unit === 'api_key'
        ? params.apiKeyId ?? params.userId
        : params.userId;

    const r = stableUnitFloat(`${params.experimentId}:${unitKey}`);
    chosen = pickWeighted(armRows, r);
  }

  // Log exposure
  await supabase.from('fall_exposures').insert({
    experiment_id: params.experimentId,
    arm_id: chosen.id,
    user_id: params.userId,
    api_key_id: params.apiKeyId ?? null,
    request_id: params.requestId ?? null,
    trace_id: params.traceId ?? null,
  });

  return {
    experimentId: params.experimentId,
    armId: chosen.id,
    armName: chosen.name,
    override: (chosen.config_override ?? {}) as Record<string, unknown>,
  };
}
