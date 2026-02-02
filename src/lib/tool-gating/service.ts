/**
 * Tool Gating Service
 *
 * Service layer for agent tool gating operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type {
  AgentTool,
  ToolToken,
  TokenWithSecret,
  ToolApproval,
  ToolExecution,
  ToolPolicy,
  CreateToolInput,
  UpdateToolInput,
  CreateTokenInput,
  CreateApprovalInput,
  CreatePolicyInput,
  ExecuteToolInput,
  PermissionCheckResult,
  ToolExecutionResponse,
  ApprovalDecision,
} from './types';

// ============================================
// Database Field Mapping
// ============================================

function mapToolFromDb(row: Record<string, unknown>): AgentTool {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string | undefined,
    category: row.category as AgentTool['category'],
    riskLevel: row.risk_level as AgentTool['riskLevel'],
    requiresApproval: row.requires_approval as boolean,
    approvalTimeoutSeconds: row.approval_timeout_seconds as number,
    capabilities: row.capabilities as string[],
    requiredScopes: row.required_scopes as string[],
    defaultRateLimit: row.default_rate_limit as number | undefined,
    defaultDailyLimit: row.default_daily_limit as number | undefined,
    inputSchema: row.input_schema as Record<string, unknown> | undefined,
    outputSchema: row.output_schema as Record<string, unknown> | undefined,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTokenFromDb(row: Record<string, unknown>): ToolToken {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string | undefined,
    name: row.name as string,
    tokenHash: row.token_hash as string,
    tokenPrefix: row.token_prefix as string,
    allowedTools: row.allowed_tools as string[],
    allowedCapabilities: row.allowed_capabilities as string[],
    deniedTools: row.denied_tools as string[],
    maxRiskLevel: row.max_risk_level as ToolToken['maxRiskLevel'],
    requireApprovalFor: row.require_approval_for as string[],
    rateLimitPerMinute: row.rate_limit_per_minute as number | undefined,
    dailyLimit: row.daily_limit as number | undefined,
    expiresAt: row.expires_at as string | undefined,
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string | undefined,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string | undefined,
    useCount: row.use_count as number,
  };
}

function mapApprovalFromDb(row: Record<string, unknown>): ToolApproval {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    tokenId: row.token_id as string,
    toolId: row.tool_id as string,
    sessionId: row.session_id as string | undefined,
    conversationId: row.conversation_id as string | undefined,
    requestPayload: row.request_payload as Record<string, unknown>,
    requestContext: row.request_context as Record<string, unknown> | undefined,
    reason: row.reason as string | undefined,
    status: row.status as ToolApproval['status'],
    decidedBy: row.decided_by as string | undefined,
    decidedAt: row.decided_at as string | undefined,
    decisionReason: row.decision_reason as string | undefined,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
    executedAt: row.executed_at as string | undefined,
    executionResult: row.execution_result as Record<string, unknown> | undefined,
    executionError: row.execution_error as string | undefined,
  };
}

// ============================================
// Token Generation
// ============================================

function generateToken(): { token: string; hash: string; prefix: string } {
  const token = `szn_tool_${crypto.randomBytes(24).toString('base64url')}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const prefix = token.slice(0, 12);
  return { token, hash, prefix };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================
// Tool Gating Service
// ============================================

export class ToolGatingService {
  constructor(private supabase: SupabaseClient) {}

  // ============================================
  // Tool Registry
  // ============================================

  async listTools(options?: {
    category?: AgentTool['category'];
    riskLevel?: AgentTool['riskLevel'];
    activeOnly?: boolean;
  }): Promise<AgentTool[]> {
    let query = this.supabase.from('agent_tools').select('*');

    if (options?.category) {
      query = query.eq('category', options.category);
    }
    if (options?.riskLevel) {
      query = query.eq('risk_level', options.riskLevel);
    }
    if (options?.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('category').order('name');

    if (error) throw error;
    return (data || []).map(mapToolFromDb);
  }

  async getTool(toolId: string): Promise<AgentTool | null> {
    const { data, error } = await this.supabase
      .from('agent_tools')
      .select('*')
      .eq('id', toolId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapToolFromDb(data);
  }

  async getToolByName(name: string): Promise<AgentTool | null> {
    const { data, error } = await this.supabase
      .from('agent_tools')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapToolFromDb(data);
  }

  async createTool(input: CreateToolInput): Promise<AgentTool> {
    const { data, error } = await this.supabase
      .from('agent_tools')
      .insert({
        name: input.name,
        display_name: input.displayName,
        description: input.description,
        category: input.category,
        risk_level: input.riskLevel || 'low',
        requires_approval: input.requiresApproval || false,
        approval_timeout_seconds: input.approvalTimeoutSeconds || 300,
        capabilities: input.capabilities || [],
        required_scopes: input.requiredScopes || [],
        default_rate_limit: input.defaultRateLimit,
        default_daily_limit: input.defaultDailyLimit,
        input_schema: input.inputSchema,
        output_schema: input.outputSchema,
      })
      .select()
      .single();

    if (error) throw error;
    return mapToolFromDb(data);
  }

  async updateTool(toolId: string, input: UpdateToolInput): Promise<AgentTool> {
    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.description !== undefined) updates.description = input.description;
    if (input.riskLevel !== undefined) updates.risk_level = input.riskLevel;
    if (input.requiresApproval !== undefined) updates.requires_approval = input.requiresApproval;
    if (input.approvalTimeoutSeconds !== undefined) updates.approval_timeout_seconds = input.approvalTimeoutSeconds;
    if (input.capabilities !== undefined) updates.capabilities = input.capabilities;
    if (input.defaultRateLimit !== undefined) updates.default_rate_limit = input.defaultRateLimit;
    if (input.defaultDailyLimit !== undefined) updates.default_daily_limit = input.defaultDailyLimit;
    if (input.inputSchema !== undefined) updates.input_schema = input.inputSchema;
    if (input.outputSchema !== undefined) updates.output_schema = input.outputSchema;
    if (input.isActive !== undefined) updates.is_active = input.isActive;

    const { data, error } = await this.supabase
      .from('agent_tools')
      .update(updates)
      .eq('id', toolId)
      .select()
      .single();

    if (error) throw error;
    return mapToolFromDb(data);
  }

  // ============================================
  // Tool Tokens
  // ============================================

  async listTokens(organizationId: string): Promise<ToolToken[]> {
    const { data, error } = await this.supabase
      .from('agent_tool_tokens')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapTokenFromDb);
  }

  async getToken(tokenId: string): Promise<ToolToken | null> {
    const { data, error } = await this.supabase
      .from('agent_tool_tokens')
      .select('*')
      .eq('id', tokenId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapTokenFromDb(data);
  }

  async getTokenByValue(token: string): Promise<ToolToken | null> {
    const hash = hashToken(token);
    const { data, error } = await this.supabase
      .from('agent_tool_tokens')
      .select('*')
      .eq('token_hash', hash)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapTokenFromDb(data);
  }

  async createToken(
    organizationId: string,
    input: CreateTokenInput,
    createdBy?: string
  ): Promise<TokenWithSecret> {
    const { token, hash, prefix } = generateToken();

    const { data, error } = await this.supabase
      .from('agent_tool_tokens')
      .insert({
        organization_id: organizationId,
        project_id: input.projectId,
        name: input.name,
        token_hash: hash,
        token_prefix: prefix,
        allowed_tools: input.allowedTools || [],
        allowed_capabilities: input.allowedCapabilities || [],
        denied_tools: input.deniedTools || [],
        max_risk_level: input.maxRiskLevel || 'medium',
        require_approval_for: input.requireApprovalFor || [],
        rate_limit_per_minute: input.rateLimitPerMinute,
        daily_limit: input.dailyLimit,
        expires_at: input.expiresAt,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      ...mapTokenFromDb(data),
      token,
    };
  }

  async revokeToken(tokenId: string): Promise<void> {
    const { error } = await this.supabase
      .from('agent_tool_tokens')
      .update({ is_active: false })
      .eq('id', tokenId);

    if (error) throw error;
  }

  async updateTokenUsage(tokenId: string): Promise<void> {
    const { error } = await this.supabase.rpc('update_token_usage', {
      p_token_id: tokenId,
    });

    // Fallback if RPC doesn't exist
    if (error) {
      await this.supabase
        .from('agent_tool_tokens')
        .update({
          last_used_at: new Date().toISOString(),
          use_count: this.supabase.rpc('increment', { x: 1 }),
        })
        .eq('id', tokenId);
    }
  }

  // ============================================
  // Permission Checking
  // ============================================

  async checkPermission(
    tokenId: string,
    toolId: string,
    input?: Record<string, unknown>
  ): Promise<PermissionCheckResult> {
    const { data, error } = await this.supabase.rpc('check_tool_permission', {
      p_token_id: tokenId,
      p_tool_id: toolId,
      p_input: input || {},
    });

    if (error) throw error;
    return data as PermissionCheckResult;
  }

  async checkPermissionByToken(
    token: string,
    toolName: string,
    input?: Record<string, unknown>
  ): Promise<PermissionCheckResult> {
    const tokenData = await this.getTokenByValue(token);
    if (!tokenData) {
      return { allowed: false, reason: 'invalid_token' };
    }

    const tool = await this.getToolByName(toolName);
    if (!tool) {
      return { allowed: false, reason: 'tool_not_found' };
    }

    return this.checkPermission(tokenData.id, tool.id, input);
  }

  // ============================================
  // Approval Workflow
  // ============================================

  async listPendingApprovals(organizationId: string): Promise<ToolApproval[]> {
    const { data, error } = await this.supabase
      .from('agent_tool_approvals')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapApprovalFromDb);
  }

  async getApproval(approvalId: string): Promise<ToolApproval | null> {
    const { data, error } = await this.supabase
      .from('agent_tool_approvals')
      .select('*')
      .eq('id', approvalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapApprovalFromDb(data);
  }

  async createApprovalRequest(
    organizationId: string,
    input: CreateApprovalInput
  ): Promise<ToolApproval> {
    const { data, error } = await this.supabase.rpc('create_tool_approval_request', {
      p_token_id: input.tokenId,
      p_tool_id: input.toolId,
      p_request_payload: input.requestPayload,
      p_context: input.requestContext || {},
      p_timeout_seconds: input.timeoutSeconds,
    });

    if (error) throw error;

    const approval = await this.getApproval(data);
    if (!approval) throw new Error('Failed to create approval request');
    return approval;
  }

  async decideApproval(decision: ApprovalDecision): Promise<ToolApproval> {
    const { data, error } = await this.supabase.rpc('decide_tool_approval', {
      p_approval_id: decision.approvalId,
      p_decision: decision.decision,
      p_reason: decision.reason,
    });

    if (error) throw error;
    if (!data.success) {
      throw new Error(data.error);
    }

    const approval = await this.getApproval(decision.approvalId);
    if (!approval) throw new Error('Approval not found after decision');
    return approval;
  }

  // ============================================
  // Tool Execution
  // ============================================

  async executeTool(
    organizationId: string,
    input: ExecuteToolInput
  ): Promise<ToolExecutionResponse> {
    const startedAt = new Date();

    // Check permission
    const permission = await this.checkPermission(input.tokenId, input.toolId, input.input);

    if (!permission.allowed) {
      // Log denied execution
      await this.logExecution(organizationId, {
        tokenId: input.tokenId,
        toolId: input.toolId,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        inputPayload: input.input,
        status: 'denied',
        errorMessage: permission.reason || 'Permission denied',
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
      });

      return {
        success: false,
        executionId: '',
        status: 'denied',
        error: permission.reason || 'Permission denied',
      };
    }

    // If approval required, create request
    if (permission.requiresApproval) {
      const approval = await this.createApprovalRequest(organizationId, {
        tokenId: input.tokenId,
        toolId: input.toolId,
        requestPayload: input.input,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        timeoutSeconds: permission.approvalTimeout,
      });

      return {
        success: false,
        executionId: '',
        status: 'denied',
        approvalRequired: true,
        approvalId: approval.id,
        error: 'Approval required',
      };
    }

    // Execute the tool (actual execution would be done by the caller)
    const executionId = crypto.randomUUID();

    await this.logExecution(organizationId, {
      id: executionId,
      tokenId: input.tokenId,
      toolId: input.toolId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      inputPayload: input.input,
      status: 'success',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Update token usage
    await this.updateTokenUsage(input.tokenId);

    return {
      success: true,
      executionId,
      status: 'success',
    };
  }

  private async logExecution(
    organizationId: string,
    execution: {
      id?: string;
      tokenId: string;
      toolId: string;
      approvalId?: string;
      sessionId?: string;
      conversationId?: string;
      inputPayload: Record<string, unknown>;
      outputPayload?: Record<string, unknown>;
      status: string;
      errorMessage?: string;
      errorCode?: string;
      startedAt: string;
      completedAt: string;
    }
  ): Promise<void> {
    await this.supabase.from('agent_tool_executions').insert({
      id: execution.id,
      organization_id: organizationId,
      token_id: execution.tokenId,
      tool_id: execution.toolId,
      approval_id: execution.approvalId,
      session_id: execution.sessionId,
      conversation_id: execution.conversationId,
      input_payload: execution.inputPayload,
      output_payload: execution.outputPayload,
      status: execution.status,
      error_message: execution.errorMessage,
      error_code: execution.errorCode,
      started_at: execution.startedAt,
      completed_at: execution.completedAt,
      duration_ms: new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime(),
    });
  }

  // ============================================
  // Policies
  // ============================================

  async listPolicies(organizationId: string): Promise<ToolPolicy[]> {
    const { data, error } = await this.supabase
      .from('agent_tool_policies')
      .select('*')
      .eq('organization_id', organizationId)
      .order('priority')
      .order('created_at');

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      rules: row.rules,
      appliesToTools: row.applies_to_tools,
      appliesToRiskLevels: row.applies_to_risk_levels,
      action: row.action,
      actionConfig: row.action_config,
      priority: row.priority,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createPolicy(
    organizationId: string,
    input: CreatePolicyInput
  ): Promise<ToolPolicy> {
    const { data, error } = await this.supabase
      .from('agent_tool_policies')
      .insert({
        organization_id: organizationId,
        name: input.name,
        description: input.description,
        rules: input.rules || {},
        applies_to_tools: input.appliesToTools || [],
        applies_to_risk_levels: input.appliesToRiskLevels || [],
        action: input.action,
        action_config: input.actionConfig || {},
        priority: input.priority || 100,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      rules: data.rules,
      appliesToTools: data.applies_to_tools,
      appliesToRiskLevels: data.applies_to_risk_levels,
      action: data.action,
      actionConfig: data.action_config,
      priority: data.priority,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

// ============================================
// Factory
// ============================================

export function createToolGatingService(supabase: SupabaseClient): ToolGatingService {
  return new ToolGatingService(supabase);
}
