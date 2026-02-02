/**
 * Seizn Winter - Built-in Rego Policy Templates
 *
 * Pre-defined policy templates for common use cases:
 * - Access control (RBAC, ABAC)
 * - Data governance (PII, retention)
 * - Rate limiting
 */

import type { RegoPolicyCategory, RegoPolicyScope, RateLimitSpec } from './types';

// ============================================
// Policy Template Types
// ============================================

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: RegoPolicyCategory;
  regoCode: string;
  defaultScope: RegoPolicyScope;
  variables?: PolicyTemplateVariable[];
}

export interface PolicyTemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'string[]';
  default: unknown;
  required?: boolean;
}

// ============================================
// Access Control Templates
// ============================================

export const ACCESS_CONTROL_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'rbac-basic',
    name: 'Basic RBAC Policy',
    description: 'Role-based access control with owner, admin, member, and viewer roles',
    category: 'access_control',
    regoCode: `package seizn.access.rbac

# Default deny
default allow := false

# Owners can do anything
allow {
  input.principal.roles[_] == "owner"
}

# Admins can do most things except delete org
allow {
  input.principal.roles[_] == "admin"
  not input.action.operation == "delete"
  not input.resource.type == "organization"
}

# Members can read and create
allow {
  input.principal.roles[_] == "member"
  input.action.operation in ["read", "list", "create", "search"]
}

# Viewers can only read
allow {
  input.principal.roles[_] == "viewer"
  input.action.operation in ["read", "list", "search"]
}`,
    defaultScope: { all: true },
  },
  {
    id: 'abac-org-boundary',
    name: 'Organization Boundary Policy',
    description: 'Ensure users can only access resources within their organization',
    category: 'access_control',
    regoCode: `package seizn.access.org_boundary

# Default deny
default allow := false

# Allow if user belongs to the same organization as the resource
allow {
  input.principal.organizationId == input.resource.organizationId
}

# System principals can access anything
allow {
  input.principal.type == "system"
}

# Service accounts with explicit access
allow {
  input.principal.type == "service"
  input.principal.attributes.allowedOrgs[_] == input.resource.organizationId
}`,
    defaultScope: { all: true },
  },
  {
    id: 'owner-access',
    name: 'Resource Owner Policy',
    description: 'Allow resource owners full access to their resources',
    category: 'access_control',
    regoCode: `package seizn.access.owner

# Default deny
default allow := false

# Owner can do anything with their resource
allow {
  input.principal.id == input.resource.ownerId
}

# Admins can manage any resource in their org
allow {
  input.principal.roles[_] == "admin"
  input.principal.organizationId == input.resource.organizationId
}`,
    defaultScope: { all: true },
  },
  {
    id: 'team-based-access',
    name: 'Team-Based Access Policy',
    description: 'Control access based on team membership',
    category: 'access_control',
    regoCode: `package seizn.access.team

# Default deny
default allow := false

# Team members can access team resources
allow {
  input.resource.teamId in input.principal.teamIds
  input.action.operation in ["read", "list", "search", "create", "update"]
}

# Team leads can delete
allow {
  input.resource.teamId in input.principal.teamIds
  input.principal.attributes.teamRole == "lead"
  input.action.operation == "delete"
}`,
    defaultScope: { all: true },
  },
  {
    id: 'time-based-access',
    name: 'Time-Based Access Policy',
    description: 'Restrict access to business hours only',
    category: 'access_control',
    regoCode: `package seizn.access.time_based

# Default deny
default allow := false

# Allow during business hours (9 AM - 6 PM, weekdays)
allow {
  input.context.time.hour >= 9
  input.context.time.hour < 18
  input.context.time.isWeekend == false
}

# Admins can access anytime
allow {
  input.principal.roles[_] == "admin"
}

# Emergency access with audit
allow {
  input.principal.attributes.emergencyAccess == true
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'startHour',
        description: 'Business hours start',
        type: 'number',
        default: 9,
      },
      {
        name: 'endHour',
        description: 'Business hours end',
        type: 'number',
        default: 18,
      },
    ],
  },
  {
    id: 'ip-restriction',
    name: 'IP-Based Access Policy',
    description: 'Restrict access to allowed IP ranges',
    category: 'access_control',
    regoCode: `package seizn.access.ip_restriction

# Default deny
default allow := false

# Allowed IP ranges (customize as needed)
allowed_ips := [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16"
]

# Allow if from allowed IP
allow {
  # Check if IP starts with allowed prefix (simplified check)
  startswith(input.context.ipAddress, "10.")
}

allow {
  startswith(input.context.ipAddress, "172.")
}

allow {
  startswith(input.context.ipAddress, "192.168.")
}

# Bypass for trusted principals
allow {
  input.principal.attributes.bypassIpRestriction == true
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'allowedIpRanges',
        description: 'Allowed IP address ranges',
        type: 'string[]',
        default: ['10.0.0.0/8', '192.168.0.0/16'],
      },
    ],
  },
];

// ============================================
// Data Governance Templates
// ============================================

export const DATA_GOVERNANCE_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'pii-protection',
    name: 'PII Protection Policy',
    description: 'Mask or deny access to data containing PII',
    category: 'data_governance',
    regoCode: `package seizn.governance.pii

# Default allow
default allow := true

# Deny if resource contains PII and user lacks PII access
deny {
  input.resource.attributes.containsPii == true
  not input.principal.attributes.piiAccess == true
}

# Apply masking instead of deny for some roles
mask_required {
  input.resource.attributes.containsPii == true
  input.principal.roles[_] == "member"
  input.action.operation == "read"
}

allow := false {
  deny
}`,
    defaultScope: { all: true },
  },
  {
    id: 'data-classification',
    name: 'Data Classification Policy',
    description: 'Enforce access based on data classification levels',
    category: 'data_governance',
    regoCode: `package seizn.governance.classification

# Default deny for classified data
default allow := false

# Classification levels (higher = more restricted)
classification_levels := {
  "public": 0,
  "internal": 1,
  "confidential": 2,
  "restricted": 3
}

# User clearance levels
user_clearance := {
  "viewer": 0,
  "member": 1,
  "admin": 2,
  "owner": 3
}

# Allow if user clearance >= data classification
allow {
  data_level := classification_levels[input.resource.attributes.classification]
  role := input.principal.roles[0]
  user_level := user_clearance[role]
  user_level >= data_level
}

# Public data is always accessible
allow {
  input.resource.attributes.classification == "public"
}`,
    defaultScope: { all: true },
  },
  {
    id: 'retention-enforcement',
    name: 'Data Retention Policy',
    description: 'Enforce data retention rules and deny access to expired data',
    category: 'data_governance',
    regoCode: `package seizn.governance.retention

# Default allow
default allow := true

# Deny access to expired data
deny {
  input.resource.attributes.expiresAt
  input.resource.attributes.expiresAt < input.context.timestamp
}

# Exception for admins doing cleanup
allow := true {
  deny
  input.principal.roles[_] == "admin"
  input.action.operation == "delete"
}

allow := false {
  deny
  not input.principal.roles[_] == "admin"
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'retentionDays',
        description: 'Default retention period in days',
        type: 'number',
        default: 90,
      },
    ],
  },
  {
    id: 'cross-border-transfer',
    name: 'Cross-Border Data Transfer Policy',
    description: 'Control data transfers based on geographic regions',
    category: 'data_governance',
    regoCode: `package seizn.governance.transfer

# Default deny cross-border
default allow := false

# Allowed transfer pairs (from -> to)
allowed_transfers := {
  {"EU", "EU"},
  {"US", "US"},
  {"EU", "US"},  # With adequate safeguards
}

# Allow if transfer is permitted
allow {
  from := input.resource.attributes.dataRegion
  to := input.context.geoLocation.region
  allowed_transfers[{from, to}]
}

# Allow if same region
allow {
  input.resource.attributes.dataRegion == input.context.geoLocation.region
}

# System access bypasses geo restrictions
allow {
  input.principal.type == "system"
}`,
    defaultScope: { all: true },
  },
  {
    id: 'gdpr-compliance',
    name: 'GDPR Compliance Policy',
    description: 'Enforce GDPR data protection requirements',
    category: 'data_governance',
    regoCode: `package seizn.governance.gdpr

# Default allow
default allow := true

# Deny processing without consent for personal data
deny {
  input.resource.attributes.isPersonalData == true
  not input.resource.attributes.hasConsent == true
  input.action.operation in ["create", "update", "share"]
}

# Deny export without adequate protection
deny {
  input.action.operation == "export"
  input.resource.attributes.isPersonalData == true
  not input.principal.attributes.gdprTrained == true
}

# Require audit for sensitive operations
audit_required {
  input.resource.attributes.isPersonalData == true
  input.action.operation in ["read", "export", "delete"]
}

allow := false {
  deny
}`,
    defaultScope: { all: true },
  },
];

// ============================================
// Rate Limiting Templates
// ============================================

export const RATE_LIMITING_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'api-rate-limit',
    name: 'API Rate Limiting Policy',
    description: 'Basic rate limiting for API endpoints',
    category: 'rate_limiting',
    regoCode: `package seizn.rate_limit.api

# Default rate limit
default_limit := 100
default_window := 60

# Rate limits by plan
plan_limits := {
  "free": 60,
  "starter": 120,
  "plus": 300,
  "pro": 600,
  "enterprise": 3000
}

# Get limit for user's plan
limit := plan_limits[input.principal.attributes.plan]

# Allow if under limit
allow {
  input.context.rateLimit.currentCount < limit
}

# Deny if over limit
deny {
  input.context.rateLimit.currentCount >= limit
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'defaultLimit',
        description: 'Default requests per window',
        type: 'number',
        default: 100,
      },
      {
        name: 'windowSeconds',
        description: 'Rate limit window in seconds',
        type: 'number',
        default: 60,
      },
    ],
  },
  {
    id: 'endpoint-rate-limit',
    name: 'Endpoint-Specific Rate Limiting',
    description: 'Different rate limits per endpoint',
    category: 'rate_limiting',
    regoCode: `package seizn.rate_limit.endpoint

# Endpoint-specific limits (requests per minute)
endpoint_limits := {
  "/api/memories": 100,
  "/api/query": 60,
  "/api/summer/search": 120,
  "/api/summer/index": 30,
  "/api/fall/traces": 200
}

# Get limit for endpoint
limit := endpoint_limits[input.action.endpoint]

# Default limit for unknown endpoints
default_limit := 100

# Allow if under endpoint limit
allow {
  limit
  input.context.rateLimit.currentCount < limit
}

# Use default for unknown endpoints
allow {
  not limit
  input.context.rateLimit.currentCount < default_limit
}`,
    defaultScope: { all: true },
  },
  {
    id: 'burst-rate-limit',
    name: 'Burst-Tolerant Rate Limiting',
    description: 'Rate limiting with burst allowance',
    category: 'rate_limiting',
    regoCode: `package seizn.rate_limit.burst

# Base configuration
base_limit := 100
burst_multiplier := 1.5
window_seconds := 60

# Calculate effective limit with burst
effective_limit := base_limit * burst_multiplier

# Allow normal requests
allow {
  input.context.rateLimit.currentCount < base_limit
}

# Allow burst requests with warning
allow_with_warning {
  input.context.rateLimit.currentCount >= base_limit
  input.context.rateLimit.currentCount < effective_limit
}

# Deny over burst limit
deny {
  input.context.rateLimit.currentCount >= effective_limit
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'baseLimit',
        description: 'Base rate limit',
        type: 'number',
        default: 100,
      },
      {
        name: 'burstMultiplier',
        description: 'Burst multiplier (1.0 - 2.0)',
        type: 'number',
        default: 1.5,
      },
    ],
  },
  {
    id: 'cost-based-limit',
    name: 'Cost-Based Rate Limiting',
    description: 'Rate limiting based on operation cost',
    category: 'rate_limiting',
    regoCode: `package seizn.rate_limit.cost

# Operation costs (1 = cheap, 10 = expensive)
operation_costs := {
  "read": 1,
  "list": 2,
  "search": 5,
  "create": 3,
  "update": 3,
  "delete": 2,
  "export": 10,
  "import": 8
}

# Budget per minute
budget := 1000

# Get cost for current operation
cost := operation_costs[input.action.operation]

# Default cost
default_cost := 1

# Allow if within budget
allow {
  cost
  input.context.rateLimit.currentCount + cost <= budget
}

allow {
  not cost
  input.context.rateLimit.currentCount + default_cost <= budget
}`,
    defaultScope: { all: true },
    variables: [
      {
        name: 'budget',
        description: 'Cost budget per minute',
        type: 'number',
        default: 1000,
      },
    ],
  },
];

// ============================================
// Audit Templates
// ============================================

export const AUDIT_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'comprehensive-audit',
    name: 'Comprehensive Audit Policy',
    description: 'Log all operations for compliance',
    category: 'audit',
    regoCode: `package seizn.audit.comprehensive

# Always allow but mark for audit
default allow := true

# Mark all write operations for audit
audit_required {
  input.action.operation in ["create", "update", "delete", "import"]
}

# Mark all admin actions for audit
audit_required {
  input.principal.roles[_] == "admin"
}

# Mark sensitive resource access for audit
audit_required {
  input.resource.type in ["api_key", "settings", "billing", "member"]
}

# Mark PII access for audit
audit_required {
  input.resource.attributes.containsPii == true
}`,
    defaultScope: { all: true },
  },
  {
    id: 'selective-audit',
    name: 'Selective Audit Policy',
    description: 'Audit only sensitive operations',
    category: 'audit',
    regoCode: `package seizn.audit.selective

# Always allow
default allow := true

# Audit deletion operations
audit_required {
  input.action.operation == "delete"
}

# Audit admin privilege operations
audit_required {
  input.resource.type == "member"
  input.action.operation in ["create", "update", "delete"]
}

# Audit API key operations
audit_required {
  input.resource.type == "api_key"
}

# Audit export operations
audit_required {
  input.action.operation == "export"
}`,
    defaultScope: { all: true },
  },
];

// ============================================
// All Templates
// ============================================

export const ALL_POLICY_TEMPLATES: PolicyTemplate[] = [
  ...ACCESS_CONTROL_TEMPLATES,
  ...DATA_GOVERNANCE_TEMPLATES,
  ...RATE_LIMITING_TEMPLATES,
  ...AUDIT_TEMPLATES,
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: RegoPolicyCategory): PolicyTemplate[] {
  return ALL_POLICY_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(templateId: string): PolicyTemplate | undefined {
  return ALL_POLICY_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Apply variables to a template
 */
export function applyTemplateVariables(
  template: PolicyTemplate,
  variables: Record<string, unknown>
): string {
  let code = template.regoCode;

  for (const [name, value] of Object.entries(variables)) {
    // Replace variable definitions in the code
    const pattern = new RegExp(`${name}\\s*:=\\s*[^\\n]+`, 'g');
    const replacement = typeof value === 'string'
      ? `${name} := "${value}"`
      : `${name} := ${JSON.stringify(value)}`;
    code = code.replace(pattern, replacement);
  }

  return code;
}

// ============================================
// Default Rate Limit Specifications
// ============================================

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitSpec> = {
  free: {
    maxRequests: 60,
    windowSeconds: 60,
    burst: 10,
    penaltySeconds: 60,
  },
  starter: {
    maxRequests: 120,
    windowSeconds: 60,
    burst: 20,
    penaltySeconds: 30,
  },
  plus: {
    maxRequests: 300,
    windowSeconds: 60,
    burst: 50,
    penaltySeconds: 15,
  },
  pro: {
    maxRequests: 600,
    windowSeconds: 60,
    burst: 100,
    penaltySeconds: 10,
  },
  enterprise: {
    maxRequests: 3000,
    windowSeconds: 60,
    burst: 500,
    penaltySeconds: 5,
  },
};

/**
 * Get rate limit specification for a plan
 */
export function getRateLimitForPlan(plan: string): RateLimitSpec {
  return DEFAULT_RATE_LIMITS[plan] || DEFAULT_RATE_LIMITS.free;
}
