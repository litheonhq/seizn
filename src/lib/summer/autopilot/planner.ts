import type { RetrievalConfig } from '../types';
import { getPlanDefaults } from '../config';
import { decideRetrievalConfig } from './decide';
import { getLatestRunningExperiment, assignExperimentArm, type Assignment } from '@/lib/fall/experiments';

export interface PlanRetrievalParams {
  requestId: string;

  userId: string;
  apiKeyId?: string;

  plan: string;
  collectionId: string;
  query: string;

  autopilotEnabled: boolean;
  override?: Partial<RetrievalConfig>;

  experimentId?: string;
}

export interface RetrievalPlan {
  config: RetrievalConfig;
  reason: string;
  experiment?: Assignment | null;
}

/**
 * Query Planner (Autopilot)
 */
export async function planRetrieval(params: PlanRetrievalParams): Promise<RetrievalPlan> {
  const defaults = getPlanDefaults(params.plan);

  // 1) Base config
  let config: RetrievalConfig;
  let reason = '';

  if (!params.autopilotEnabled) {
    config = {
      ...defaults,
      ...(params.override ?? {}),
    };
    reason = 'Autopilot disabled; using plan defaults + override.';
  } else {
    const decided = decideRetrievalConfig({
      plan: params.plan,
      query: params.query,
    });
    config = {
      ...decided.config,
      ...(params.override ?? {}),
    };
    reason = decided.reason;
  }

  // 2) Budget guardrails (MVP)
  if (String(params.plan).toLowerCase() === 'free') {
    config.topK = Math.min(Math.max(config.topK, 5), 30);
    config.rerankTopN = Math.min(config.rerankTopN, 20);
  }

  // 3) Experiments (optional)
  let experiment: Assignment | null = null;
  const expId = params.experimentId ?? (await getLatestRunningExperiment(params.userId))?.id;

  if (expId) {
    try {
      experiment = await assignExperimentArm({
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        experimentId: expId,
        requestId: params.requestId,
      });

      if (experiment?.override) {
        config = {
          ...config,
          ...(experiment.override as Partial<RetrievalConfig>),
        };
        reason = `${reason} Experiment applied: ${experiment.armName}.`;
      }
    } catch {
      experiment = null;
    }
  }

  return { config, reason, experiment };
}
