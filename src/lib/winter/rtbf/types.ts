/**
 * Seizn Winter - RTBF (Right to Be Forgotten) Types
 *
 * GDPR Article 17 "Right to erasure" compliant type definitions
 * for complete data deletion with audit trail.
 */

// ============================================
// Erasure Scope Types
// ============================================

export type ErasureScope = 'user' | 'memory' | 'namespace' | 'date_range';

export type ErasureStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type ErasurePhase =
  | 'requested'
  | 'analyzing'
  | 'backing_up'
  | 'soft_delete'
  | 'hard_delete'
  | 'verifying'
  | 'completed'
  | 'failed';

// ============================================
// Request Types
// ============================================

export interface RTBFRequest {
  id: string;
  requester_id: string;
  subject_id: string;
  scope: ErasureScope;
  scope_params: ErasureScopeParams;
  reason: string;
  legal_basis?: string;
  retain_audit_log: boolean;
  status: ErasureStatus;
  phase: ErasurePhase;
  requested_at: string;
  processed_at?: string;
  completed_at?: string;
  expires_at?: string;
}

export interface ErasureScopeParams {
  // For 'user' scope
  user_id?: string;

  // For 'memory' scope
  memory_ids?: string[];

  // For 'namespace' scope
  namespace?: string;
  user_id_for_namespace?: string;

  // For 'date_range' scope
  date_from?: string;
  date_to?: string;
  user_id_for_date_range?: string;
}

export interface CreateRTBFRequestParams {
  requesterId: string;
  subjectId: string;
  scope: ErasureScope;
  scopeParams: ErasureScopeParams;
  reason: string;
  legalBasis?: string;
  retainAuditLog?: boolean;
}

// ============================================
// Analysis Types
// ============================================

export interface ImpactAnalysis {
  request_id: string;
  affected_tables: AffectedTable[];
  total_records: number;
  total_size_bytes: number;
  has_dependencies: boolean;
  dependencies: TableDependency[];
  warnings: string[];
  estimated_duration_seconds: number;
}

export interface AffectedTable {
  table_name: string;
  record_count: number;
  estimated_size_bytes: number;
  has_cascade: boolean;
  cascade_tables?: string[];
}

export interface TableDependency {
  source_table: string;
  target_table: string;
  relationship: 'cascade' | 'set_null' | 'restrict';
  record_count: number;
}

// ============================================
// Execution Types
// ============================================

export interface ExecuteRTBFParams {
  requestId: string;
  skipBackup?: boolean;
  dryRun?: boolean;
}

export interface ErasureResult {
  request_id: string;
  success: boolean;
  phase: ErasurePhase;
  deleted_records: DeletedRecordSummary[];
  total_deleted: number;
  verification_hash?: string;
  error?: string;
  duration_ms: number;
}

export interface DeletedRecordSummary {
  table_name: string;
  deleted_count: number;
  soft_deleted?: number;
  hard_deleted?: number;
}

// ============================================
// Backup Types
// ============================================

export interface BackupConfig {
  enabled: boolean;
  retention_days: number;
  legal_hold?: boolean;
  encryption_key?: string;
}

export interface ErasureBackup {
  id: string;
  request_id: string;
  backup_data: string; // Encrypted JSON
  data_hash: string;
  created_at: string;
  expires_at: string;
  legal_hold: boolean;
}

// ============================================
// Audit Log Types
// ============================================

export interface RTBFAuditLog {
  id: string;
  request_id: string;
  requester_id: string;
  subject_id: string;
  scope: ErasureScope;
  scope_params: ErasureScopeParams;
  affected_tables: string[];
  affected_count: number;
  status: ErasureStatus;
  phase: ErasurePhase;
  verification_hash?: string;
  backup_id?: string;
  metadata: RTBFMetadata;
  requested_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface RTBFMetadata {
  ip_address?: string;
  user_agent?: string;
  reason?: string;
  legal_basis?: string;
  initiated_by: 'user' | 'admin' | 'system' | 'api';
  execution_mode: 'sync' | 'async';
  dry_run: boolean;
}

// ============================================
// Verification Types
// ============================================

export interface VerificationResult {
  request_id: string;
  verified: boolean;
  checks: VerificationCheck[];
  remaining_records: RemainingRecord[];
  verification_hash: string;
  verified_at: string;
}

export interface VerificationCheck {
  table_name: string;
  expected_count: number;
  actual_count: number;
  passed: boolean;
  error?: string;
}

export interface RemainingRecord {
  table_name: string;
  record_id: string;
  reason: string;
}

// ============================================
// API Response Types
// ============================================

export interface RTBFRequestResponse {
  request_id: string;
  status: ErasureStatus;
  phase: ErasurePhase;
  estimated_completion?: string;
  impact_analysis?: ImpactAnalysis;
}

export interface RTBFStatusResponse {
  request_id: string;
  status: ErasureStatus;
  phase: ErasurePhase;
  progress_percent: number;
  started_at?: string;
  completed_at?: string;
  result?: ErasureResult;
  error?: string;
}

export interface RTBFAuditResponse {
  logs: RTBFAuditLog[];
  total_count: number;
  page: number;
  per_page: number;
}

// ============================================
// Configuration Types
// ============================================

export interface RTBFConfig {
  // Tables to include in erasure
  erasure_tables: ErasureTableConfig[];

  // Backup settings
  backup: BackupConfig;

  // Verification settings
  verification: {
    enabled: boolean;
    retry_count: number;
  };

  // Timing
  soft_delete_grace_period_days: number;
  hard_delete_delay_seconds: number;

  // Logging
  audit_log_retention_years: number;
}

export interface ErasureTableConfig {
  table_name: string;
  user_id_column: string;
  soft_delete_column?: string;
  has_cascade: boolean;
  priority: number; // Order of deletion (lower = first)
  conditions?: Record<string, unknown>;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_RTBF_CONFIG: RTBFConfig = {
  erasure_tables: [
    // Spring/Memory tables
    { table_name: 'memories', user_id_column: 'user_id', soft_delete_column: 'is_deleted', has_cascade: false, priority: 1 },
    { table_name: 'memory_edges', user_id_column: 'user_id', has_cascade: false, priority: 2 },
    { table_name: 'memory_provenance', user_id_column: 'user_id', has_cascade: false, priority: 3 },
    { table_name: 'memory_policy_decisions', user_id_column: 'user_id', has_cascade: false, priority: 4 },

    // Summer/RAG tables
    { table_name: 'summer_collections', user_id_column: 'user_id', has_cascade: true, priority: 10 },
    { table_name: 'summer_documents', user_id_column: 'user_id', has_cascade: true, priority: 11 },
    { table_name: 'summer_chunks', user_id_column: 'user_id', has_cascade: false, priority: 12 },

    // Fall/Observability tables
    { table_name: 'fall_retrieval_traces', user_id_column: 'user_id', has_cascade: false, priority: 20 },
    { table_name: 'fall_retrieval_feedback', user_id_column: 'user_id', has_cascade: false, priority: 21 },
    { table_name: 'fall_eval_datasets', user_id_column: 'user_id', has_cascade: true, priority: 22 },
    { table_name: 'fall_experiments', user_id_column: 'user_id', has_cascade: true, priority: 23 },
    { table_name: 'fall_flight_recordings', user_id_column: 'user_id', has_cascade: false, priority: 24 },

    // Winter/Governance tables
    { table_name: 'winter_policies', user_id_column: 'user_id', has_cascade: false, priority: 30 },
    { table_name: 'winter_pii_events', user_id_column: 'user_id', has_cascade: false, priority: 31 },
    { table_name: 'winter_deletion_jobs', user_id_column: 'user_id', has_cascade: false, priority: 32 },

    // User tables (last)
    { table_name: 'api_keys', user_id_column: 'user_id', has_cascade: false, priority: 90 },
    { table_name: 'webhooks', user_id_column: 'user_id', has_cascade: false, priority: 91 },
    { table_name: 'usage_logs', user_id_column: 'user_id', has_cascade: false, priority: 92 },
  ],

  backup: {
    enabled: true,
    retention_days: 90,
    legal_hold: false,
  },

  verification: {
    enabled: true,
    retry_count: 3,
  },

  soft_delete_grace_period_days: 30,
  hard_delete_delay_seconds: 5,
  audit_log_retention_years: 7,
};
