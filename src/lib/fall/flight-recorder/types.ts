export type RetrievalEventType =
  | 'embed'
  | 'candidates'
  | 'rerank'
  | 'context'
  | 'answer_contract'
  | 'feedback'
  | 'error';

export interface RetrievalEvent {
  type: RetrievalEventType;
  ts: string; // ISO
  payload: Record<string, unknown>;
}

export interface TraceStartParams {
  requestId: string;
  userId: string;
  apiKeyId?: string;
  plan: string;
  collectionId?: string;
  collectionIds?: string[];
  queryText?: string;
  autopilotEnabled?: boolean;
}

export interface TraceSummary {
  autopilotReason?: string;
  effectiveConfig?: Record<string, unknown>;
  timingsMs?: Record<string, number>;
  resultsCount?: number;
  error?: string;
  experimentId?: string;
  armId?: string;
}

export interface TraceHandle {
  traceId: string;
  requestId: string;
  startedAtMs: number;
  sampled: boolean;
  events: RetrievalEvent[];
  base: TraceStartParams;
}
