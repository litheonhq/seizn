import type { PiiMaskingConfig } from './pii-safe';
import type { SamplingConfig, SamplingReason } from './sampling';

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
  /** Whether PII was detected and masked in this event */
  piiMasked?: boolean;
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
  /** Chunk texts for context event (will be PII-masked if configured) */
  chunkTexts?: string[];
}

export interface TraceHandle {
  traceId: string;
  requestId: string;
  startedAtMs: number;
  sampled: boolean;
  events: RetrievalEvent[];
  base: TraceStartParams;
  /** Sampling decision metadata */
  samplingInfo?: {
    rate: number;
    reason: SamplingReason;
  };
}

/**
 * Configuration for the Flight Recorder
 */
export interface FlightRecorderConfig {
  /** PII masking configuration */
  piiMasking?: Partial<PiiMaskingConfig>;
  /** Sampling configuration */
  sampling?: Partial<SamplingConfig>;
  /** Enable debug logging */
  debug?: boolean;
}
