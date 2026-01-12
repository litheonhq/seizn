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
