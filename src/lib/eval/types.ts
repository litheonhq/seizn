/**
 * Auto-Eval System - Types
 *
 * Type definitions for automatic evaluation triggered by policy/model changes.
 * Implements SSDF (Secure Software Development Framework) requirements for
 * continuous validation of AI governance policies.
 */

// ============================================
// Event Types
// ============================================

export type EvalTriggerType =
  | 'policy_version_created'
  | 'policy_version_published'
  | 'policy_installed'
  | 'policy_updated'
  | 'policy_activated'
  | 'policy_deactivated'
  | 'firewall_pattern_added'
  | 'firewall_config_changed'
  | 'model_config_changed';

export interface EvalTriggerEvent {
  id: string;
  type: EvalTriggerType;
  timestamp: string;
  source: 'policy_pack' | 'opa_policy' | 'firewall' | 'model_config';
  metadata: {
    organizationId?: string;
    userId?: string;
    packId?: string;
    versionId?: string;
    installationId?: string;
    policyId?: string;
    configKey?: string;
    previousValue?: unknown;
    newValue?: unknown;
  };
}

// ============================================
// Evaluation Types
// ============================================

export type EvalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type EvalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface EvalTestSuite {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'regression' | 'compliance' | 'performance';
  enabled: boolean;
}

export interface EvalTestResult {
  testId: string;
  testName: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  severity?: EvalSeverity;
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
}

export interface EvalRunSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  criticalIssues: number;
  highIssues: number;
  durationMs: number;
}

export interface EvalRun {
  id: string;
  triggerId: string;
  triggerType: EvalTriggerType;
  organizationId?: string;
  status: EvalStatus;
  startedAt: string;
  completedAt?: string;
  summary?: EvalRunSummary;
  results: EvalTestResult[];
  metadata: Record<string, unknown>;
}

// ============================================
// Configuration Types
// ============================================

export interface AutoEvalConfig {
  id: string;
  organizationId: string;
  packId?: string;

  // Trigger settings
  evalOnPublish: boolean;
  evalOnInstall: boolean;
  evalOnUpdate: boolean;
  evalOnActivation: boolean;

  // Test suites
  runSecurityTests: boolean;
  runRegressionTests: boolean;
  runComplianceTests: boolean;
  runPerformanceTests: boolean;

  // Thresholds
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  regressionThreshold: number; // 0-1, e.g., 0.05 = 5% regression

  // Notifications
  slackWebhookUrl?: string;
  emailRecipients: string[];
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface AutoEvalConfigInput {
  packId?: string;
  evalOnPublish?: boolean;
  evalOnInstall?: boolean;
  evalOnUpdate?: boolean;
  evalOnActivation?: boolean;
  runSecurityTests?: boolean;
  runRegressionTests?: boolean;
  runComplianceTests?: boolean;
  runPerformanceTests?: boolean;
  blockOnCritical?: boolean;
  blockOnHigh?: boolean;
  regressionThreshold?: number;
  slackWebhookUrl?: string;
  emailRecipients?: string[];
  notifyOnSuccess?: boolean;
  notifyOnFailure?: boolean;
}

// ============================================
// Database Types
// ============================================

export interface AutoEvalConfigRow {
  id: string;
  organization_id: string;
  pack_id?: string;
  eval_on_publish: boolean;
  eval_on_install: boolean;
  eval_on_update: boolean;
  eval_on_activation: boolean;
  run_security_tests: boolean;
  run_regression_tests: boolean;
  run_compliance_tests: boolean;
  run_performance_tests: boolean;
  block_on_critical: boolean;
  block_on_high: boolean;
  regression_threshold: number;
  slack_webhook_url?: string;
  email_recipients: string[];
  notify_on_success: boolean;
  notify_on_failure: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvalTriggerEventRow {
  id: string;
  type: EvalTriggerType;
  source: string;
  organization_id?: string;
  user_id?: string;
  metadata: Record<string, unknown>;
  processed: boolean;
  processed_at?: string;
  created_at: string;
}

export interface EvalRunRow {
  id: string;
  trigger_id: string;
  trigger_type: EvalTriggerType;
  organization_id?: string;
  status: EvalStatus;
  started_at: string;
  completed_at?: string;
  summary: EvalRunSummary | null;
  results: EvalTestResult[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// API Types
// ============================================

export interface TriggerEvalRequest {
  type: EvalTriggerType;
  source: 'policy_pack' | 'opa_policy' | 'firewall' | 'model_config';
  metadata: Record<string, unknown>;
  async?: boolean; // If true, return immediately and run in background
}

export interface TriggerEvalResponse {
  triggerId: string;
  runId?: string; // Only present if sync execution
  status: 'queued' | 'running' | 'completed';
  message: string;
}

export interface EvalRunResponse {
  run: EvalRun;
  blocked: boolean;
  blockReason?: string;
}

export interface EvalHistoryResponse {
  runs: EvalRun[];
  total: number;
  page: number;
  pageSize: number;
}
