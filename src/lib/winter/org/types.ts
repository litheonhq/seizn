/**
 * Seizn Winter - Organization Governance Types
 *
 * Type definitions for organization, team, member, role,
 * permission, policy, audit log, and report structures.
 */

// ============================================
// Organization Structure
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlan;

  // Billing
  stripe_customer_id?: string;
  stripe_subscription_id?: string;

  // Limits
  memory_limit: number;
  api_calls_limit: number;

  // Settings
  settings: OrganizationSettings;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export type OrganizationPlan = 'free' | 'team' | 'business' | 'enterprise';

export interface OrganizationSettings {
  /** Custom branding */
  logo_url?: string;
  primary_color?: string;

  /** Security settings */
  enforce_2fa?: boolean;
  allowed_domains?: string[];
  ip_allowlist?: string[];

  /** Default policies for new members */
  default_member_role?: OrgRole;
  default_retention_days?: number;

  /** Notification settings */
  security_alerts_email?: string;
  weekly_report_enabled?: boolean;

  /** SSO configuration */
  sso_enabled?: boolean;
  sso_provider?: 'saml' | 'oidc';
  sso_config?: Record<string, unknown>;
}

// ============================================
// Team Structure
// ============================================

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;

  // Settings
  settings: TeamSettings;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface TeamSettings {
  /** Default collection for team memories */
  default_collection_id?: string;

  /** Access control */
  visibility: 'private' | 'org_visible' | 'public';

  /** Resource limits (overrides org limits) */
  memory_limit?: number;
  api_calls_limit?: number;
}

// ============================================
// Member Structure
// ============================================

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;

  // Custom permissions (override role defaults)
  permissions: PermissionOverrides;

  // Invite tracking
  invited_by?: string;
  invited_at?: string;
  accepted_at?: string;

  // Status
  status: MemberStatus;
  last_active_at?: string;

  // Timestamps
  created_at: string;

  // Joined user data (from query)
  user?: {
    id: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export type MemberStatus = 'active' | 'suspended' | 'pending';

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;

  created_at: string;
}

// ============================================
// Role System
// ============================================

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type TeamRole = 'lead' | 'member' | 'viewer';

export interface RoleDefinition {
  role: OrgRole | TeamRole;
  name: string;
  description: string;
  permissions: Permission[];
  isCustom?: boolean;
}

// ============================================
// Permission System (RBAC)
// ============================================

export type ResourceType =
  | 'memories'
  | 'collections'
  | 'documents'
  | 'api_keys'
  | 'webhooks'
  | 'settings'
  | 'members'
  | 'teams'
  | 'policies'
  | 'audit_logs'
  | 'reports'
  | 'billing';

export type ActionType =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'admin'
  | 'export'
  | 'import';

export interface Permission {
  resource: ResourceType;
  actions: ActionType[];
}

export interface PermissionOverrides {
  /** Grant additional permissions beyond role default */
  grant?: Permission[];
  /** Revoke permissions from role default */
  deny?: Permission[];
}

export interface PermissionCheck {
  resource: ResourceType;
  action: ActionType;
  resourceId?: string;
}

// ============================================
// Policy System
// ============================================

export type PolicyType =
  | 'retention_policy'
  | 'pii_policy'
  | 'access_policy'
  | 'audit_policy'
  | 'security_policy';

export interface OrgPolicy {
  id: string;
  organization_id: string;
  policy_type: PolicyType;
  name: string;
  description?: string;

  // Policy configuration
  config: PolicyConfig;

  // Scope
  scope: PolicyScope;

  // Status
  is_active: boolean;
  priority: number;

  // Versioning
  current_version?: number;
  draft_version_id?: string;

  // Metadata
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyScope {
  /** Apply to specific teams */
  team_ids?: string[];
  /** Apply to specific users */
  user_ids?: string[];
  /** Apply to all */
  all?: boolean;
}

export type PolicyConfig =
  | RetentionPolicyConfig
  | PiiPolicyConfig
  | AccessPolicyConfig
  | AuditPolicyConfig
  | SecurityPolicyConfig;

export interface RetentionPolicyConfig {
  type: 'retention_policy';
  /** Data retention period in days */
  retention_days: number;
  /** Grace period before hard delete (days) */
  grace_period_days: number;
  /** Types of data this applies to */
  data_types: ('memories' | 'traces' | 'documents' | 'audit_logs')[];
  /** Exempt certain data from retention */
  exempt_tags?: string[];
}

export interface PiiPolicyConfig {
  type: 'pii_policy';
  /** Default action for PII */
  default_action: 'allow' | 'mask' | 'deny' | 'encrypt';
  /** Per-type overrides */
  type_actions?: Record<string, 'allow' | 'mask' | 'deny' | 'encrypt'>;
  /** Auto-detect and log PII */
  auto_detect: boolean;
  /** Notify on PII detection */
  notify_on_detection: boolean;
}

export interface AccessPolicyConfig {
  type: 'access_policy';
  /** IP allowlist */
  ip_allowlist?: string[];
  /** IP denylist */
  ip_denylist?: string[];
  /** Require 2FA */
  require_2fa: boolean;
  /** Session timeout (minutes) */
  session_timeout_minutes: number;
  /** Max concurrent sessions */
  max_sessions: number;
  /** Allowed domains for SSO */
  allowed_domains?: string[];
}

export interface AuditPolicyConfig {
  type: 'audit_policy';
  /** Log all API calls */
  log_all_api_calls: boolean;
  /** Log read operations */
  log_reads: boolean;
  /** Log write operations */
  log_writes: boolean;
  /** Log authentication events */
  log_auth_events: boolean;
  /** Log admin actions */
  log_admin_actions: boolean;
  /** Retention period for audit logs (days) */
  log_retention_days: number;
  /** Export audit logs to external service */
  export_config?: {
    enabled: boolean;
    destination: 'siem' | 's3' | 'webhook';
    endpoint?: string;
  };
}

export interface SecurityPolicyConfig {
  type: 'security_policy';
  /** Minimum password requirements */
  password_policy: {
    min_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_numbers: boolean;
    require_special: boolean;
    max_age_days?: number;
  };
  /** API key policy */
  api_key_policy: {
    max_keys_per_user: number;
    max_age_days?: number;
    require_rotation: boolean;
  };
  /** Webhook security */
  webhook_policy: {
    require_https: boolean;
    require_signature: boolean;
  };
}

// ============================================
// Audit Log System
// ============================================

export interface AuditLogEntry {
  id: string;

  // Who
  user_id?: string;
  organization_id?: string;
  api_key_id?: string;
  service_account?: string;

  // What
  action: AuditAction;
  resource_type: ResourceType;
  resource_id?: string;

  // Details
  details: Record<string, unknown>;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;

  // Context
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;

  // Result
  status: 'success' | 'failed' | 'denied';
  error_message?: string;

  // Timestamp
  created_at: string;

  // Joined user data
  user?: {
    email: string;
    full_name?: string;
  };
}

export type AuditAction =
  // Memory actions
  | 'memory.create'
  | 'memory.read'
  | 'memory.update'
  | 'memory.delete'
  | 'memory.export'
  | 'memory.import'
  // Collection actions
  | 'collection.create'
  | 'collection.update'
  | 'collection.delete'
  // API key actions
  | 'api_key.create'
  | 'api_key.revoke'
  | 'api_key.rotate'
  // Organization actions
  | 'org.create'
  | 'org.update'
  | 'org.delete'
  | 'org.settings_change'
  // Member actions
  | 'member.invite'
  | 'member.join'
  | 'member.role_change'
  | 'member.remove'
  | 'member.suspend'
  // Team actions
  | 'team.create'
  | 'team.update'
  | 'team.delete'
  | 'team.member_add'
  | 'team.member_remove'
  // Policy actions
  | 'policy.create'
  | 'policy.update'
  | 'policy.delete'
  | 'policy.activate'
  | 'policy.deactivate'
  // Policy versioning actions
  | 'policy.version_create'
  | 'policy.version_update'
  | 'policy.version_publish'
  | 'policy.version_delete'
  | 'policy.version_rollback'
  // Webhook actions
  | 'webhook.create'
  | 'webhook.update'
  | 'webhook.delete'
  // Auth actions
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.2fa_enabled'
  | 'auth.2fa_disabled'
  | 'auth.password_change'
  // Security actions
  | 'security.ip_blocked'
  | 'security.rate_limited'
  | 'security.suspicious_activity'
  // Billing actions
  | 'billing.plan_change'
  | 'billing.payment_failed'
  | 'billing.invoice_created'
  // PII actions
  | 'pii.detected'
  | 'pii.masked'
  | 'pii.denied'
  // Data actions
  | 'data.export'
  | 'data.deletion_requested'
  | 'data.deletion_completed';

export interface AuditLogFilter {
  organization_id?: string;
  user_id?: string;
  action?: AuditAction | AuditAction[];
  resource_type?: ResourceType | ResourceType[];
  resource_id?: string;
  status?: 'success' | 'failed' | 'denied';
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// Report System
// ============================================

export type ReportType =
  | 'usage_monthly'
  | 'usage_weekly'
  | 'security_events'
  | 'compliance_gdpr'
  | 'compliance_soc2'
  | 'member_activity'
  | 'api_usage'
  | 'cost_analysis';

export interface Report {
  id: string;
  organization_id: string;
  report_type: ReportType;

  // Period
  period_start: string;
  period_end: string;

  // Report data
  data: ReportData;

  // Generation info
  generated_by: 'system' | 'user';
  generated_at: string;

  // Storage
  file_url?: string;
  expires_at?: string;
}

export type ReportData =
  | UsageReportData
  | SecurityReportData
  | ComplianceReportData
  | MemberActivityReportData
  | ApiUsageReportData
  | CostAnalysisReportData;

export interface UsageReportData {
  type: 'usage';
  summary: {
    total_memories: number;
    total_api_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    active_users: number;
    storage_used_mb: number;
  };
  daily_breakdown: Array<{
    date: string;
    memories_created: number;
    api_calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  top_users: Array<{
    user_id: string;
    email: string;
    api_calls: number;
    memories_created: number;
  }>;
}

export interface SecurityReportData {
  type: 'security';
  summary: {
    total_events: number;
    critical_events: number;
    warnings: number;
    blocked_attempts: number;
  };
  events_by_type: Record<string, number>;
  blocked_ips: string[];
  suspicious_users: Array<{
    user_id: string;
    email: string;
    event_count: number;
    events: string[];
  }>;
  recommendations: string[];
}

export interface ComplianceReportData {
  type: 'compliance';
  framework: 'gdpr' | 'soc2' | 'hipaa';
  status: 'compliant' | 'non_compliant' | 'partial';
  checks: Array<{
    id: string;
    name: string;
    description: string;
    status: 'pass' | 'fail' | 'warning' | 'not_applicable';
    details?: string;
  }>;
  data_processing: {
    pii_detected: number;
    pii_masked: number;
    pii_denied: number;
    data_exports: number;
    deletion_requests: number;
    deletion_completed: number;
  };
  retention_compliance: {
    compliant_records: number;
    overdue_records: number;
    pending_deletion: number;
  };
}

export interface MemberActivityReportData {
  type: 'member_activity';
  summary: {
    total_members: number;
    active_members: number;
    inactive_members: number;
    new_members: number;
    removed_members: number;
  };
  members: Array<{
    user_id: string;
    email: string;
    role: OrgRole;
    last_active: string;
    api_calls: number;
    memories_created: number;
    status: 'active' | 'inactive' | 'new';
  }>;
}

export interface ApiUsageReportData {
  type: 'api_usage';
  summary: {
    total_calls: number;
    success_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    error_count: number;
  };
  endpoints: Array<{
    endpoint: string;
    method: string;
    calls: number;
    success_rate: number;
    avg_latency_ms: number;
    errors: number;
  }>;
  errors_by_type: Record<string, number>;
  rate_limits_hit: number;
}

export interface CostAnalysisReportData {
  type: 'cost_analysis';
  summary: {
    total_cost_usd: number;
    cost_per_user_usd: number;
    projected_monthly_usd: number;
  };
  breakdown: {
    memory_storage_usd: number;
    api_calls_usd: number;
    embedding_tokens_usd: number;
    retrieval_tokens_usd: number;
  };
  daily_costs: Array<{
    date: string;
    cost_usd: number;
  }>;
  cost_by_user: Array<{
    user_id: string;
    email: string;
    cost_usd: number;
  }>;
}

// ============================================
// Helper Types
// ============================================

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface OrgContext {
  organization: Organization;
  member: OrgMember;
  permissions: Permission[];
}
