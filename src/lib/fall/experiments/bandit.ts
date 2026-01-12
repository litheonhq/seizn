/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase';
import type { ExperimentArm } from './types';

export interface ArmStats {
  armId: string;
  successes: number;
  trials: number;
  mean: number;
}

/**
 * Epsilon-greedy bandit:
 * - Explore with probability epsilon
 * - Otherwise exploit best mean outcome
 *
 * NOTE: This is intentionally simple (MVP). You can upgrade to Thompson sampling later.
 */
export async function pickBanditArm(params: {
  experimentId: string;
  epsilon?: number;
}): Promise<{ arm: ExperimentArm; stats: ArmStats[] }> {
  const supabase = createServerClient();
  const epsilon = params.epsilon ?? 0.1;

  const { data: arms, error: armsErr } = await supabase
    .from('fall_experiment_arms')
    .select('id, experiment_id, name, weight, config_override')
    .eq('experiment_id', params.experimentId);

  if (armsErr) throw armsErr;
  const armRows = (arms ?? []) as any[];
  if (armRows.length === 0) throw new Error('No experiment arms');

  // Aggregate outcomes as successes/trials
  const { data: outcomes, error: outErr } = await supabase
    .from('fall_outcomes')
    .select('arm_id, event_type, value')
    .eq('experiment_id', params.experimentId);

  if (outErr) throw outErr;

  const statsByArm = new Map<string, { successes: number; trials: number }>();
  for (const a of armRows) statsByArm.set(a.id, { successes: 0, trials: 0 });

  for (const o of (outcomes ?? []) as any[]) {
    const armId = String(o.arm_id);
    const rec = statsByArm.get(armId);
    if (!rec) continue;

    rec.trials += 1;

    const eventType = String(o.event_type ?? '');
    const value = Number(o.value ?? 1);

    // Define what counts as success (tweakable)
    const isSuccess = ['accept', 'thumb_up'].includes(eventType) || (eventType === 'click' && value > 0);
    if (isSuccess) rec.successes += 1;
  }

  const stats: ArmStats[] = armRows.map((a) => {
    const rec = statsByArm.get(a.id)!;
    const mean = rec.trials > 0 ? rec.successes / rec.trials : 0;
    return { armId: a.id, successes: rec.successes, trials: rec.trials, mean };
  });

  // Explore
  if (Math.random() < epsilon) {
    const arm = armRows[Math.floor(Math.random() * armRows.length)] as ExperimentArm;
    return { arm, stats };
  }

  // Exploit best mean
  const best = stats.slice().sort((x, y) => y.mean - x.mean)[0];
  const bestArm = armRows.find((a) => a.id === best.armId) as ExperimentArm;
  return { arm: bestArm, stats };
}
