/**
 * Data Retention Policy Types
 *
 * Type definitions for:
 * - Retention schedules
 * - Legal holds
 * - Auto-deletion workflows
 */

// ============================================
// Retention Schedule Types
// ============================================

export interface RetentionSchedule {
  id: string;
  organization_id: string;
  name: string;
  description?: string;

  // Data type this applies to
  data_type: RetentionDataType;

  // Retention periods
  retention_days: number;
  archive_days?: number; // Days before archiving (null = no archive)

  // Deletion behavior
  deletion_type: DeletionType;

  // Conditions
  conditions: RetentionConditions;

  // Notification
  notify_before_days: number;
  notify_emails?: string[];

  // Status
  is_active: boolean;
  priority: number;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type RetentionDataType =
  | 'memories'
  | 'documents'
  | 'traces'
  | 'audit_logs'
  | 'api_keys'
  | 'sessions';

export type DeletionType = 'soft' | 'hard' | 'anonymize';

export interface RetentionConditions {
  // Tag-based filtering
  tags?: string[];
  exclude_tags?: string[];

  // Access-based filtering
  min_access_count?: number;
  last_accessed_before_days?: number;

  // Date-based filtering
  created_before?: string;
  created_after?: string;

  // Custom metadata conditions
  metadata?: Record<string, unknown>;
}

// ============================================
// Legal Hold Types
// ============================================

export interface LegalHold {
  id: string;
  organization_id: string;

  // Hold details
  name: string;
  description?: string;
  reason: string;

  // Scope
  scope_type: LegalHoldScopeType;
  scope_config: LegalHoldScopeConfig;

  // Status
  status: LegalHoldStatus;

  // Timeline
  effective_from: string;
  effective_until?: string; // null = indefinite
  released_at?: string;
  released_by?: string;

  // Legal reference
  legal_matter_id?: string;
  custodian_email?: string;

  // Audit
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type LegalHoldScopeType = 'all' | 'collection' | 'user' | 'tag' | 'date_range';
export type LegalHoldStatus = 'active' | 'released' | 'expired';

export interface LegalHoldScopeConfig {
  // For scope_type: 'collection'
  collection_ids?: string[];

  // For scope_type: 'user'
  user_ids?: string[];

  // For scope_type: 'tag'
  tags?: string[];

  // For scope_type: 'date_range'
  start_date?: string;
  end_date?: string;
}

// ============================================
// Execution Log Types
// ============================================

export interface RetentionExecutionLog {
  id: string;
  organization_id: string;
  schedule_id?: string;

  // Execution details
  execution_type: ExecutionType;
  data_type: RetentionDataType;

  // Results
  records_processed: number;
  records_deleted: number;
  records_archived: number;
  records_skipped: number;

  // Status
  status: ExecutionStatus;
  started_at: string;
  completed_at?: string;

  // Error handling
  error_message?: string;
  error_details?: Record<string, unknown>;

  // Audit
  triggered_by?: string;

  created_at: string;
}

export type ExecutionType = 'scheduled' | 'manual' | 'legal_release';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// ============================================
// CRUD Types
// ============================================

export interface CreateRetentionScheduleParams {
  organization_id: string;
  name: string;
  description?: string;
  data_type: RetentionDataType;
  retention_days: number;
  archive_days?: number;
  deletion_type?: DeletionType;
  conditions?: RetentionConditions;
  notify_before_days?: number;
  notify_emails?: string[];
  priority?: number;
  created_by: string;
}

export interface UpdateRetentionScheduleParams {
  id: string;
  name?: string;
  description?: string;
  retention_days?: number;
  archive_days?: number;
  deletion_type?: DeletionType;
  conditions?: RetentionConditions;
  notify_before_days?: number;
  notify_emails?: string[];
  is_active?: boolean;
  priority?: number;
}

export interface ListRetentionSchedulesParams {
  organization_id: string;
  data_type?: RetentionDataType;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateLegalHoldParams {
  organization_id: string;
  name: string;
  description?: string;
  reason: string;
  scope_type: LegalHoldScopeType;
  scope_config: LegalHoldScopeConfig;
  effective_from?: string;
  effective_until?: string;
  legal_matter_id?: string;
  custodian_email?: string;
  created_by: string;
}

export interface UpdateLegalHoldParams {
  id: string;
  name?: string;
  description?: string;
  reason?: string;
  effective_until?: string;
  legal_matter_id?: string;
  custodian_email?: string;
}

export interface ListLegalHoldsParams {
  organization_id: string;
  status?: LegalHoldStatus;
  scope_type?: LegalHoldScopeType;
  limit?: number;
  offset?: number;
}

// ============================================
// Retention Check Types
// ============================================

export interface RetentionCheckRequest {
  organization_id: string;
  data_type: RetentionDataType;
  record_id?: string;
  user_id?: string;
  tags?: string[];
  created_at?: string;
}

export interface RetentionCheckResult {
  // Can the record be deleted?
  can_delete: boolean;

  // Reasons if can't delete
  blocked_reasons: string[];

  // Legal hold information
  legal_holds: LegalHold[];

  // Retention information
  retention_days: number;
  deletion_date?: string; // When it will be eligible for deletion
  archive_date?: string; // When it will be archived

  // Data type
  data_type: RetentionDataType;
}

// ============================================
// Preview Types
// ============================================

export interface RetentionPreview {
  organization_id: string;
  data_type: RetentionDataType;

  // Counts by status
  total_records: number;
  eligible_for_deletion: number;
  eligible_for_archive: number;
  under_legal_hold: number;

  // Sample records
  sample_records: {
    id: string;
    created_at: string;
    tags?: string[];
    status: 'delete' | 'archive' | 'hold' | 'retain';
    reason: string;
  }[];
}
