/**
 * Tool Gating Types
 *
 * TypeScript definitions for agent tool gating (OWASP Excessive Agency mitigation).
 */

export type ToolCategory = 'read' | 'write' | 'execute' | 'admin' | 'external';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'auto_approved';
export type ExecutionStatus = 'success' | 'error' | 'denied' | 'timeout' | 'rate_limited';
export type PolicyAction = 'allow' | 'deny' | 'require_approval' | 'rate_limit';

// ============================================
// Tool Registry
// ============================================

export interface AgentTool {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: ToolCategory;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  approvalTimeoutSeconds: number;
  capabilities: string[];
  requiredScopes: string[];
  defaultRateLimit?: number;
  defaultDailyLimit?: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateToolInput {
  name: string;
  displayName: string;
  description?: string;
  category: ToolCategory;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  approvalTimeoutSeconds?: number;
  capabilities?: string[];
  requiredScopes?: string[];
  defaultRateLimit?: number;
  defaultDailyLimit?: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface UpdateToolInput {
  displayName?: string;
  description?: string;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  approvalTimeoutSeconds?: number;
  capabilities?: string[];
  defaultRateLimit?: number;
  defaultDailyLimit?: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive?: boolean;
}

// ============================================
// Tool Tokens
// ============================================

export interface ToolToken {
  id: string;
  organizationId: string;
  projectId?: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  allowedTools: string[];
  allowedCapabilities: string[];
  deniedTools: string[];
  maxRiskLevel: RiskLevel;
  requireApprovalFor: string[];
  rateLimitPerMinute?: number;
  dailyLimit?: number;
  expiresAt?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  lastUsedAt?: string;
  useCount: number;
}

export interface CreateTokenInput {
  name: string;
  projectId?: string;
  allowedTools?: string[];
  allowedCapabilities?: string[];
  deniedTools?: string[];
  maxRiskLevel?: RiskLevel;
  requireApprovalFor?: string[];
  rateLimitPerMinute?: number;
  dailyLimit?: number;
  expiresAt?: string;
}

export interface TokenWithSecret extends ToolToken {
  /** The actual token value - only returned once on creation */
  token: string;
}

// ============================================
// Approval Workflow
// ============================================

export interface ToolApproval {
  id: string;
  organizationId: string;
  tokenId: string;
  toolId: string;
  sessionId?: string;
  conversationId?: string;
  requestPayload: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  reason?: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  expiresAt: string;
  createdAt: string;
  executedAt?: string;
  executionResult?: Record<string, unknown>;
  executionError?: string;
}

export interface CreateApprovalInput {
  tokenId: string;
  toolId: string;
  requestPayload: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  sessionId?: string;
  conversationId?: string;
  timeoutSeconds?: number;
}

export interface ApprovalDecision {
  approvalId: string;
  decision: 'approved' | 'denied';
  reason?: string;
}

// ============================================
// Tool Execution
// ============================================

export interface ToolExecution {
  id: string;
  organizationId: string;
  tokenId?: string;
  toolId: string;
  approvalId?: string;
  sessionId?: string;
  conversationId?: string;
  inputPayload: Record<string, unknown>;
  inputHash?: string;
  outputPayload?: Record<string, unknown>;
  outputTruncated: boolean;
  status: ExecutionStatus;
  errorMessage?: string;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  rateLimitRemaining?: number;
  dailyLimitRemaining?: number;
}

export interface ExecuteToolInput {
  tokenId: string;
  toolId: string;
  input: Record<string, unknown>;
  sessionId?: string;
  conversationId?: string;
  waitForApproval?: boolean;
  approvalTimeoutMs?: number;
}

// ============================================
// Tool Policies
// ============================================

export interface ToolPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  rules: Record<string, unknown>;
  appliesToTools: string[];
  appliesToRiskLevels: RiskLevel[];
  action: PolicyAction;
  actionConfig: Record<string, unknown>;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  rules?: Record<string, unknown>;
  appliesToTools?: string[];
  appliesToRiskLevels?: RiskLevel[];
  action: PolicyAction;
  actionConfig?: Record<string, unknown>;
  priority?: number;
}

// ============================================
// Permission Check Results
// ============================================

export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval?: boolean;
  approvalTimeout?: number;
  reason?: string;
  toolRisk?: RiskLevel;
  maxAllowed?: RiskLevel;
  tool?: {
    id: string;
    name: string;
    riskLevel: RiskLevel;
    category: ToolCategory;
  };
}

// ============================================
// API Response Types
// ============================================

export interface ToolExecutionResponse {
  success: boolean;
  executionId: string;
  status: ExecutionStatus;
  output?: Record<string, unknown>;
  error?: string;
  approvalRequired?: boolean;
  approvalId?: string;
}

export interface PendingApprovalsResponse {
  approvals: Array<
    ToolApproval & {
      tool: Pick<AgentTool, 'id' | 'name' | 'displayName' | 'riskLevel'>;
      token: Pick<ToolToken, 'id' | 'name'>;
    }
  >;
  total: number;
}
