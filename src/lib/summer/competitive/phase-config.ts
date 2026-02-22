export type CompetitivePhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CompetitiveExecutionOptions {
  phaseOverride?: number;
  aggressive?: boolean;
  queryExpansion?: boolean;
  lateInteraction?: boolean;
  intentRouting?: boolean;
  graphAugmentation?: boolean;
  trustGuard?: boolean;
  shadowEval?: boolean;
}

export interface CompetitiveExecutionFeatures {
  phase: CompetitivePhase;
  aggressive: boolean;
  retrievalFusion: boolean;
  queryExpansion: boolean;
  lateInteraction: boolean;
  intentRouting: boolean;
  graphAugmentation: boolean;
  tierAwareScoring: boolean;
  onlineLearning: boolean;
  trustGuard: boolean;
  shadowEval: boolean;
}

const MAX_PHASE: CompetitivePhase = 7;

function clampPhase(value: number): CompetitivePhase {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.max(0, Math.min(MAX_PHASE, Math.floor(value)));
  return normalized as CompetitivePhase;
}

function parsePhaseFromEnv(): CompetitivePhase {
  const raw = process.env.SUMMER_COMPETITIVE_PHASE;
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  return clampPhase(parsed);
}

function parseAggressiveFlagFromEnv(): boolean {
  return process.env.SUMMER_COMPETITIVE_AGGRESSIVE === 'true';
}

export function resolveCompetitiveFeatures(
  options: CompetitiveExecutionOptions = {}
): CompetitiveExecutionFeatures {
  const phase = clampPhase(options.phaseOverride ?? parsePhaseFromEnv());
  const aggressive = options.aggressive ?? parseAggressiveFlagFromEnv();

  const base: CompetitiveExecutionFeatures = {
    phase,
    aggressive,
    retrievalFusion: phase >= 1,
    queryExpansion: phase >= 1 && aggressive,
    lateInteraction: phase >= 1 && aggressive,
    intentRouting: phase >= 2,
    graphAugmentation: phase >= 2,
    tierAwareScoring: phase >= 3,
    onlineLearning: phase >= 4,
    trustGuard: phase >= 5,
    shadowEval: phase >= 6,
  };

  return {
    ...base,
    queryExpansion: options.queryExpansion ?? base.queryExpansion,
    lateInteraction: options.lateInteraction ?? base.lateInteraction,
    intentRouting: options.intentRouting ?? base.intentRouting,
    graphAugmentation: options.graphAugmentation ?? base.graphAugmentation,
    trustGuard: options.trustGuard ?? base.trustGuard,
    shadowEval: options.shadowEval ?? base.shadowEval,
  };
}

