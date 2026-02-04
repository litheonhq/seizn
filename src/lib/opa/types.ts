/**
 * Seizn OPA Policy Types
 *
 * TypeScript types for OPA/Rego policy evaluation
 */

// ============================================
// Policy Input Types
// ============================================

export type PolicyAction =
  | 'memory.write'
  | 'memory.read'
  | 'memory.delete'
  | 'memory.export'
  | 'trace.share'
  | 'trace.view'
  | 'mcp.tool.execute'
  | 'pii.action'
  | 'api_key.create'
  | 'api_key.revoke'
  | 'policy.update'
  | 'member.role_change'
  | 'billing.plan_change'
  // K-12 specific actions
  | 'k12.tutor_mode'
  | 'k12.hint_access'
  | 'k12.answer_reveal'
  | 'k12.content'
  | 'k12.receipt_view'
  | 'k12.photo_upload';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type PlanType = 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';
export type PiiAction = 'allow' | 'mask' | 'deny' | 'encrypt';
export type K12Role = 'researcher' | 'teacher' | 'parent' | 'student' | 'guest';
export type GradeBand = 'elementary' | 'middle' | 'high';
export type SafetyLevel = 'child' | 'teen' | 'adult';

export interface PolicyUser {
  id: string;
  role: UserRole | K12Role;
  plan: PlanType;
  org_id?: string;
  has_2fa?: boolean;
  allowed_namespaces?: string[];
  // K-12 extensions
  grade_band?: GradeBand;
  age?: number;
  workspace_id?: string;
  child_ids?: string[];
}

export interface PolicyResource {
  type: 'memory' | 'trace' | 'collection' | 'api_key' | 'policy' | 'receipt';
  id?: string;
  namespace?: string;
  collection_id?: string;
  owner_id?: string;
  workspace_id?: string;
  student_id?: string;
}

export interface PolicyContext {
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  request_id?: string;
  session_id?: string;
  current_memory_count?: number;
  current_api_key_count?: number;
  request_count_minute?: number;
}

export interface PolicySession {
  id?: string;
  mode?: 'tutor' | 'assessment' | 'study';
  hints_used?: number;
  attempts?: number;
  duration_minutes?: number;
  workspace_suspended?: boolean;
}

export interface PolicyData {
  content?: string;
  pii_detected?: string[];
  memory_type?: string;
  safety_flags?: string[];
  content_flags?: string[];
  content_level?: string;
  tool_name?: string;
  share_target?: {
    type: 'internal' | 'external';
    org_id?: string;
    user_id?: string;
  };
  anonymized?: boolean;
  file_size_mb?: number;
  file_type?: string;
  exif?: {
    gps_location?: boolean;
  };
}

export interface PolicyConfig {
  pii_action?: PiiAction;
  pii_type_actions?: Record<string, PiiAction>;
  retention_days?: number;
  ip_allowlist?: string[];
  ip_denylist?: string[];
  require_2fa?: boolean;
  log_all_api_calls?: boolean;
  allowed_tools?: string[];
  blocked_tools?: string[];
  // K-12 extensions
  max_hints?: number;
  answer_reveal_allowed?: boolean;
  safety_level?: SafetyLevel;
}

export interface PolicyInput {
  action: PolicyAction;
  user: PolicyUser;
  resource?: PolicyResource;
  context: PolicyContext;
  session?: PolicySession;
  data?: PolicyData;
  policy_config?: PolicyConfig;
}

// ============================================
// Policy Output Types
// ============================================

export interface PolicyDecision {
  allow: boolean;
  deny_reasons: string[];
  pii_action: PiiAction;
  pii_type_actions?: Record<string, PiiAction>;
  rate_limit: number;
  audit_required: boolean;
  evaluated_at: string;
}

export interface K12PolicyDecision {
  allow: boolean;
  hint_level: number;
  hint_type?: 'conceptual' | 'strategy' | 'partial' | 'scaffold' | 'worked';
  answer_allowed: boolean;
  safety_action: 'allow' | 'block' | 'block_and_notify_parent';
  session_time_limit: number;
  grade_appropriate: boolean;
}

// ============================================
// Policy Evaluation Types
// ============================================

export interface PolicyBundle {
  name: string;
  version: string;
  policies: string[];
  wasm?: ArrayBuffer;
  compiledAt?: string;
}

export interface PolicyEvaluationOptions {
  bundle?: string;
  entrypoint?: string;
  strict?: boolean;
  trace?: boolean;
}

export interface PolicyEvaluationResult<T = PolicyDecision> {
  decision: T;
  evaluationTime: number;
  bundleVersion: string;
  trace?: PolicyTrace[];
}

export interface PolicyTrace {
  type: 'enter' | 'eval' | 'exit' | 'redo' | 'fail';
  op: string;
  location?: {
    file: string;
    row: number;
    col: number;
  };
  message?: string;
}

// ============================================
// Policy Simulation Types
// ============================================

export interface PolicySimulationRequest {
  input: PolicyInput;
  bundles?: string[];
  entrypoint?: string;
  explain?: boolean;
}

export interface PolicySimulationResponse {
  result: PolicyDecision | K12PolicyDecision;
  explanation?: PolicyExplanation;
  evaluation_time_ms: number;
  bundle_version: string;
}

export interface PolicyExplanation {
  rules_evaluated: string[];
  rules_matched: string[];
  deny_reasons_detail: Array<{
    reason: string;
    rule: string;
    inputs_used: Record<string, unknown>;
  }>;
  trace?: PolicyTrace[];
}

// ============================================
// Policy Management Types
// ============================================

export interface PolicyDefinition {
  id: string;
  name: string;
  description?: string;
  rego: string;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyCompilationResult {
  success: boolean;
  wasm?: ArrayBuffer;
  errors?: PolicyCompilationError[];
  warnings?: string[];
  compiled_at: string;
}

export interface PolicyCompilationError {
  code: string;
  message: string;
  location?: {
    file: string;
    row: number;
    col: number;
  };
}

// ============================================
// Policy Test Types
// ============================================

export interface PolicyTestCase {
  name: string;
  description?: string;
  input: PolicyInput;
  expected: Partial<PolicyDecision | K12PolicyDecision>;
}

export interface PolicyTestResult {
  name: string;
  passed: boolean;
  actual: PolicyDecision | K12PolicyDecision;
  expected: Partial<PolicyDecision | K12PolicyDecision>;
  diff?: Record<string, { expected: unknown; actual: unknown }>;
  duration_ms: number;
}

export interface PolicyTestSuite {
  name: string;
  tests: PolicyTestCase[];
}

export interface PolicyTestSuiteResult {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  results: PolicyTestResult[];
  duration_ms: number;
}
