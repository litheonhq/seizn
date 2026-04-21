export type ChaosRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ChaosPromptCategory =
  | 'jailbreak'
  | 'logic_trap'
  | 'canon_probe'
  | 'emotional_attack'
  | 'contradiction_loop'
  | 'dead_end';

export type ChaosFindingCategory =
  | 'canon_violation'
  | 'toxic_output'
  | 'contradiction_loop'
  | 'dead_end'
  | 'jailbreak_leak'
  | 'endpoint_error';

export type ChaosSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ChaosPrompt {
  index: number;
  category: ChaosPromptCategory;
  prompt: string;
  expectedBehavior: string;
}

export interface ChaosRun {
  id: string;
  studioId: string;
  createdBy: string | null;
  npcId: string;
  suite: string;
  status: ChaosRunStatus;
  promptCount: number;
  targetEndpoint: string | null;
  targetMode: 'seizn-hosted' | 'external';
  progressTotal: number;
  progressCompleted: number;
  findingsCount: number;
  failureSummary: Record<string, unknown>;
  costMetadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChaosFinding {
  id: string;
  runId: string;
  studioId: string;
  npcId: string;
  promptIndex: number;
  prompt: string;
  promptCategory: ChaosPromptCategory;
  category: ChaosFindingCategory;
  severity: ChaosSeverity;
  expectedBehavior: string | null;
  actualOutput: string | null;
  verdict: Record<string, unknown>;
  replayTraceId: string | null;
  replayBundleUrl: string | null;
  createdAt: string;
}
