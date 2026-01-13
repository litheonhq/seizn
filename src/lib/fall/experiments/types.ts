export type ExperimentStatus = 'draft' | 'running' | 'stopped';
export type AllocationStrategy = 'ab' | 'bandit';
export type AllocationUnit = 'user' | 'api_key' | 'session';

export interface Experiment {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  status: ExperimentStatus;
  allocation_strategy: AllocationStrategy;
  unit: AllocationUnit;
}

export interface ExperimentArm {
  id: string;
  experiment_id: string;
  name: string;
  weight: number;
  config_override: Record<string, unknown>;
}

export interface Assignment {
  experimentId: string;
  armId: string;
  armName: string;
  override: Record<string, unknown>;
}

// Winner detection and rollout types
export type RolloutStage = 'candidate' | '10%' | '50%' | '100%' | 'completed';

export interface WinnerCandidate {
  armId: string;
  armName: string;
  successRate: number;
  trials: number;
  uplift: number; // percentage improvement over control
  confidence: number; // statistical confidence (0-1)
  pValue: number;
}

export interface WinnerAnalysis {
  experimentId: string;
  hasWinner: boolean;
  winner: WinnerCandidate | null;
  control: WinnerCandidate | null;
  allCandidates: WinnerCandidate[];
  canDeclareWinner: boolean;
  blockers: string[];
  recommendation: 'wait' | 'rollout' | 'stop' | 'inconclusive';
}

export interface RolloutConfig {
  experimentId: string;
  winnerArmId: string;
  targetStage: RolloutStage;
  previousStage?: RolloutStage;
  rolloutPercentage: number;
  createdAt: string;
}

export interface RolloutResult {
  success: boolean;
  experimentId: string;
  winnerArmId: string;
  stage: RolloutStage;
  weights: Record<string, number>;
  message: string;
}

// Guardrail types
export type GuardrailType = 'min_sample' | 'srm' | 'regression' | 'duration';
export type GuardrailStatus = 'pass' | 'fail' | 'warn' | 'pending';

export interface GuardrailCheck {
  type: GuardrailType;
  status: GuardrailStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface GuardrailConfig {
  minSampleSize: number; // minimum trials per arm
  minDurationHours: number; // minimum experiment duration
  maxDurationDays: number; // maximum experiment duration
  srmThreshold: number; // p-value threshold for SRM (default 0.01)
  significanceLevel: number; // alpha for winner detection (default 0.05)
  minUplift: number; // minimum improvement to declare winner (default 0.05 = 5%)
  enableAutoStop: boolean; // auto-stop on guardrail failure
  webhookUrl?: string; // webhook for alerts
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  minSampleSize: 100,
  minDurationHours: 24,
  maxDurationDays: 30,
  srmThreshold: 0.01,
  significanceLevel: 0.05,
  minUplift: 0.05,
  enableAutoStop: false,
};

export interface GuardrailReport {
  experimentId: string;
  checks: GuardrailCheck[];
  overallStatus: GuardrailStatus;
  canProceed: boolean;
  alerts: string[];
}
