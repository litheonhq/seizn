/**
 * C3: Consent-Aware Network Learning Types
 *
 * Type definitions for privacy-preserving network learning.
 * No PII is stored or transmitted in these types.
 */

// ============================================
// Consent Types
// ============================================

export type ConsentStatus = 'opted_in' | 'opted_out' | 'pending';
export type SignalType = 'query_pattern' | 'plan_path' | 'retrieval_metric' | 'feedback';

export interface UserConsent {
  userId: string;
  status: ConsentStatus;
  dataTypes: SignalType[];
  consentedAt?: string;
  revokedAt?: string;
  version: string;
}

export interface ConsentRecord {
  id: string;
  user_id: string;
  status: ConsentStatus;
  data_types: SignalType[];
  consented_at: string | null;
  revoked_at: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Signal Types (Anonymized)
// ============================================

export interface AnonymizedSignal {
  id: string;
  signalType: SignalType;
  queryCluster: string;
  planPath: string[];
  metrics: {
    latencyMs: number;
    resultsCount: number;
    feedbackScore?: number;
  };
  timestamp: string;
  // PII excluded: userId, apiKeyId, etc.
}

export interface SignalRecord {
  id: string;
  signal_type: SignalType;
  query_cluster: string;
  plan_path: string[];
  latency_ms: number;
  results_count: number;
  feedback_score: number | null;
  created_at: string;
}

// ============================================
// Aggregation Types
// ============================================

export type AggregationPeriod = 'daily' | 'weekly' | 'monthly';

export interface AggregatedInsight {
  id: string;
  period: AggregationPeriod;
  queryCluster: string;
  sampleCount: number;
  avgLatencyMs: number;
  avgResultsCount: number;
  avgFeedbackScore?: number;
  topPlanPaths: { path: string[]; count: number }[];
  createdAt: string;
}

export interface InsightRecord {
  id: string;
  period: AggregationPeriod;
  period_start: string;
  period_end: string;
  query_cluster: string;
  sample_count: number;
  avg_latency_ms: number;
  avg_results_count: number;
  avg_feedback_score: number | null;
  top_plan_paths: { path: string[]; count: number }[];
  created_at: string;
}

// ============================================
// Policy Types
// ============================================

export interface PolicyUpdate {
  id: string;
  targetPolicy: string;
  changes: Record<string, unknown>;
  basedOnInsights: string[];
  confidence: number;
  appliedAt?: string;
}

export interface PolicyUpdateRecord {
  id: string;
  target_policy: string;
  changes: Record<string, unknown>;
  based_on_insights: string[];
  confidence: number;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Configuration Types
// ============================================

export interface NetworkLearningConfig {
  /** Minimum sample count before aggregation */
  minSampleSize: number;
  /** Minimum confidence threshold for policy updates */
  minConfidence: number;
  /** Query clustering similarity threshold (0-1) */
  clusteringThreshold: number;
  /** Enable automatic policy application */
  autoApplyEnabled: boolean;
  /** Version of consent terms */
  consentVersion: string;
}

export const DEFAULT_NETWORK_LEARNING_CONFIG: NetworkLearningConfig = {
  minSampleSize: 100,
  minConfidence: 0.8,
  clusteringThreshold: 0.85,
  autoApplyEnabled: false,
  consentVersion: '1.0.0',
};

// ============================================
// API Response Types
// ============================================

export interface ConsentResponse {
  success: boolean;
  consent: UserConsent;
}

export interface InsightsResponse {
  success: boolean;
  insights: AggregatedInsight[];
  period: AggregationPeriod;
  totalCount: number;
}

export interface PolicyResponse {
  success: boolean;
  updates: PolicyUpdate[];
  pendingCount: number;
  appliedCount: number;
}
