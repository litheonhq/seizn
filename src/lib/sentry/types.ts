/**
 * RAG Sentry - Incident Triage + Auto RCA Types
 *
 * Types for automatic incident detection, grouping, and root cause analysis.
 */

// ============================================
// Core Types
// ============================================

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Incident status
 */
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

/**
 * Error types for categorization
 */
export type ErrorType =
  | 'missing_context'      // Retrieved docs don't contain relevant info
  | 'low_faithfulness'     // Answer doesn't match retrieved context
  | 'timeout'              // Request exceeded SLO
  | 'policy_blocked'       // Blocked by governance policy
  | 'embedding_mismatch'   // Embedding quality issue
  | 'rerank_failure'       // Reranker failed or degraded
  | 'hallucination'        // Generated content not grounded
  | 'stale_context'        // Retrieved docs are outdated
  | 'query_mismatch'       // Query intent not understood
  | 'empty_results'        // No results returned
  | 'unknown';             // Unclassified error

// ============================================
// Incident Types
// ============================================

/**
 * Root Cause Analysis candidate
 */
export interface RCACandidate {
  /** Identified cause */
  cause: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Suggested fix action */
  fixSuggestion: string;
  /** Evidence supporting this cause */
  evidence: string[];
  /** Category of the cause */
  category: 'retrieval' | 'generation' | 'configuration' | 'data' | 'infrastructure';
}

/**
 * RCA analysis result
 */
export interface RCAResult {
  /** Primary error type */
  errorType: ErrorType;
  /** RCA candidates sorted by confidence */
  candidates: RCACandidate[];
  /** Analysis timestamp */
  analyzedAt: string;
  /** Trace data used for analysis */
  traceSnapshot?: TraceSnapshot;
}

/**
 * Snapshot of trace data for RCA
 */
export interface TraceSnapshot {
  /** Query text */
  query?: string;
  /** Query hash */
  queryHash?: string;
  /** Retrieved document IDs */
  topDocIds?: string[];
  /** Faithfulness score */
  faithfulness?: number;
  /** Total latency */
  latencyMs?: number;
  /** Error message if any */
  error?: string;
  /** Planner path taken */
  plannerPath?: string;
  /** Collection ID */
  collectionId?: string;
}

/**
 * Incident from database
 */
export interface Incident {
  id: string;
  fingerprint: string;
  userId: string;
  orgId?: string;
  collectionId?: string;

  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;

  rcaCandidates: RCACandidate[];
  errorType?: ErrorType;

  occurrenceCount: number;
  affectedTraces: string[];

  sampleQuery?: string;
  sampleResponse?: string;
  sampleTraceId?: string;

  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Incident event from timeline
 */
export interface IncidentEvent {
  id: string;
  incidentId: string;
  traceId?: string;
  userId: string;
  eventType: IncidentEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type IncidentEventType =
  | 'created'
  | 'occurrence'
  | 'status_change'
  | 'rca_updated'
  | 'note_added'
  | 'merged';

// ============================================
// Fingerprint Types
// ============================================

/**
 * Input data for fingerprint generation
 */
export interface FingerprintInput {
  /** Collection ID */
  collectionId?: string;
  /** Planner path taken (e.g., "vector+rerank") */
  plannerPath?: string;
  /** Top retrieved document IDs */
  topDocIds?: string[];
  /** Error type */
  errorType?: ErrorType;
  /** Query hash (for specific query issues) */
  queryHash?: string;
}

/**
 * Fingerprint result
 */
export interface FingerprintResult {
  /** Generated fingerprint string */
  fingerprint: string;
  /** Components used to generate */
  components: string[];
}

// ============================================
// Trigger Types
// ============================================

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  /** Enable auto-triggering */
  enabled: boolean;
  /** Faithfulness threshold (trigger if below) */
  faithfulnessThreshold: number;
  /** Latency SLO in ms (trigger if above) */
  latencySloMs: number;
  /** Error rate threshold (trigger if above) */
  errorRateThreshold: number;
  /** Minimum occurrences before escalating severity */
  minOccurrencesForEscalation: number;
}

/**
 * Default trigger configuration
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  enabled: true,
  faithfulnessThreshold: 0.7,
  latencySloMs: 5000,
  errorRateThreshold: 0.05,
  minOccurrencesForEscalation: 5,
};

/**
 * Trigger input from various sources
 */
export interface TriggerInput {
  /** User ID */
  userId: string;
  /** Trace ID */
  traceId: string;
  /** Trigger source */
  source: 'eval_failure' | 'user_feedback' | 'auto_detect' | 'manual';
  /** Trace data */
  trace: {
    queryText?: string;
    queryHash?: string;
    collectionId?: string;
    plannerPath?: string;
    topDocIds?: string[];
    faithfulness?: number;
    latencyMs?: number;
    error?: string;
    response?: string;
  };
  /** User feedback if applicable */
  feedback?: {
    type: 'thumb_down' | 'wrong_answer' | 'irrelevant' | 'outdated';
    comment?: string;
  };
}

/**
 * Trigger result
 */
export interface TriggerResult {
  /** Whether an incident was created/updated */
  triggered: boolean;
  /** Incident ID (if triggered) */
  incidentId?: string;
  /** Whether this is a new incident */
  isNew?: boolean;
  /** RCA result */
  rca?: RCAResult;
  /** Reason if not triggered */
  skipReason?: string;
}

// ============================================
// API Types
// ============================================

/**
 * List incidents query params
 */
export interface ListIncidentsParams {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  errorType?: ErrorType;
  collectionId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Incident summary stats
 */
export interface IncidentSummary {
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  highIncidents: number;
  resolvedToday: number;
  newToday: number;
}

/**
 * Incident detail with events
 */
export interface IncidentDetail extends Incident {
  events: IncidentEvent[];
  relatedTraces: TraceSnapshot[];
}
