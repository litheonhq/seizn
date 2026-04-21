export const STORY_HEALTH_METRICS = [
  {
    key: 'trust_drift',
    label: 'Trust drift',
    unit: 'delta',
    direction: 'neutral',
  },
  {
    key: 'dialogue_entropy',
    label: 'Dialogue entropy',
    unit: 'score',
    direction: 'higher',
  },
  {
    key: 'canon_violation_density',
    label: 'Canon hits / 1K memories',
    unit: 'density',
    direction: 'lower',
  },
  {
    key: 'contradiction_rate',
    label: 'Contradictions / session',
    unit: 'rate',
    direction: 'lower',
  },
  {
    key: 'engagement_proxy',
    label: 'Engagement proxy',
    unit: 'seconds',
    direction: 'higher',
  },
  {
    key: 'narrative_consistency_score',
    label: 'Narrative consistency',
    unit: 'score',
    direction: 'higher',
  },
] as const;

export type StoryHealthMetricKey = (typeof STORY_HEALTH_METRICS)[number]['key'];

export interface StoryHealthDrilldownItem {
  traceId: string;
  label: string;
  source: 'replay' | 'canon' | 'chaos' | 'bug-report' | 'memory';
  severity?: string | null;
  createdAt?: string | null;
}

export type StoryHealthDrilldowns = Partial<Record<StoryHealthMetricKey, StoryHealthDrilldownItem[]>>;

export interface StoryHealthSnapshot {
  id: string;
  studioId: string;
  act: string;
  snapshotDate: string;
  windowStart: string;
  windowEnd: string;
  trustDrift: number;
  dialogueEntropy: number;
  canonViolationDensity: number;
  contradictionRate: number;
  engagementProxy: number;
  narrativeConsistencyScore: number;
  sessionCount: number;
  memoryCount: number;
  canonViolationCount: number;
  confusionReportCount: number;
  contradictionCount: number;
  replayTraceIds: string[];
  drilldowns: StoryHealthDrilldowns;
  judgeNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryHealthReplaySample {
  traceId: string;
  act: string;
  endpoint: string | null;
  durationMs: number;
  text: string;
  createdAt: string;
}

export interface RawStoryHealthActMetrics {
  act: string;
  trustDrift: number;
  dialogueEntropy: number;
  canonViolationDensity: number;
  contradictionRate: number;
  engagementProxy: number;
  sessionCount: number;
  memoryCount: number;
  canonViolationCount: number;
  confusionReportCount: number;
  contradictionCount: number;
  replayTraceIds: string[];
  drilldowns: StoryHealthDrilldowns;
  replaySamples: StoryHealthReplaySample[];
}

export interface StoryHealthEvaluationResult {
  snapshots: StoryHealthSnapshot[];
  windowStart: string;
  windowEnd: string;
}
