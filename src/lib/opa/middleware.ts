/**
 * Seizn OPA Policy Middleware
 *
 * Middleware helpers for integrating OPA policies with Next.js API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  PolicyInput,
  PolicyDecision,
  PolicyAction,
  PlanType,
  UserRole,
  PiiAction,
} from './types';
import { evaluatePolicy, evaluateK12Policy } from './evaluator';

// ============================================
// Types
// ============================================

export interface PolicyMiddlewareConfig {
  /** Skip policy check for certain actions */
  skipActions?: PolicyAction[];
  /** Default PII action if not specified */
  defaultPiiAction?: PiiAction;
  /** Whether to log policy decisions */
  logDecisions?: boolean;
  /** Custom handler for denied requests */
  onDeny?: (decision: PolicyDecision, request: NextRequest) => NextResponse | void;
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  plan: PlanType;
  org_id?: string;
  has_2fa?: boolean;
}

export interface PolicyCheckResult {
  allowed: boolean;
  decision: PolicyDecision;
  evaluationTime: number;
}

// ============================================
// Middleware Functions
// ============================================

/**
 * Check policy before processing request
 */
export async function checkPolicy(
  request: NextRequest,
  action: PolicyAction,
  user: AuthenticatedUser,
  data?: {
    content?: string;
    pii_detected?: string[];
    memory_type?: string;
    resource_id?: string;
    namespace?: string;
  },
  config?: PolicyMiddlewareConfig
): Promise<PolicyCheckResult> {
  // Skip if action is in skip list
  if (config?.skipActions?.includes(action)) {
    return {
      allowed: true,
      decision: {
        allow: true,
        deny_reasons: [],
        pii_action: 'allow',
        rate_limit: 3000,
        audit_required: false,
        evaluated_at: new Date().toISOString(),
      },
      evaluationTime: 0,
    };
  }

  // Build policy input
  const input: PolicyInput = {
    action,
    user: {
      id: user.id,
      role: user.role,
      plan: user.plan,
      org_id: user.org_id,
      has_2fa: user.has_2fa,
    },
    context: {
      ip_address: getClientIp(request),
      user_agent: request.headers.get('user-agent') || undefined,
      timestamp: new Date().toISOString(),
      request_id: request.headers.get('x-request-id') || generateRequestId(),
    },
    data: {
      content: data?.content,
      pii_detected: data?.pii_detected || [],
      memory_type: data?.memory_type,
    },
    resource: data?.resource_id
      ? {
          type: action.split('.')[0] as 'memory' | 'trace' | 'collection',
          id: data.resource_id,
          namespace: data.namespace,
        }
      : undefined,
    policy_config: {
      pii_action: config?.defaultPiiAction || 'mask',
    },
  };

  // Evaluate policy
  const result = await evaluatePolicy(input);

  // Log if configured
  if (config?.logDecisions) {
    console.log('[OPA Policy]', {
      action,
      userId: user.id,
      allowed: result.decision.allow,
      denyReasons: result.decision.deny_reasons,
      evaluationTime: result.evaluationTime,
    });
  }

  return {
    allowed: result.decision.allow,
    decision: result.decision,
    evaluationTime: result.evaluationTime,
  };
}

/**
 * Create policy-enforced API handler wrapper
 */
export function withPolicy<T>(
  action: PolicyAction,
  handler: (
    request: NextRequest,
    user: AuthenticatedUser,
    decision: PolicyDecision
  ) => Promise<NextResponse<T>>,
  config?: PolicyMiddlewareConfig
) {
  return async (
    request: NextRequest,
    user: AuthenticatedUser,
    data?: {
      content?: string;
      pii_detected?: string[];
    }
  ): Promise<NextResponse<T>> => {
    const result = await checkPolicy(request, action, user, data, config);

    if (!result.allowed) {
      // Use custom deny handler if provided
      if (config?.onDeny) {
        const customResponse = config.onDeny(result.decision, request);
        if (customResponse) {
          return customResponse as NextResponse<T>;
        }
      }

      // Default deny response
      return NextResponse.json(
        {
          error: 'POLICY_DENIED',
          message: 'Request denied by policy',
          reasons: result.decision.deny_reasons,
        },
        { status: 403 }
      ) as NextResponse<T>;
    }

    // Call the actual handler
    return handler(request, user, result.decision);
  };
}

/**
 * Check K-12 specific policy
 */
export async function checkK12Policy(
  request: NextRequest,
  action: PolicyAction,
  user: AuthenticatedUser & {
    grade_band?: 'elementary' | 'middle' | 'high';
    workspace_id?: string;
  },
  session?: {
    id?: string;
    mode?: 'tutor' | 'assessment' | 'study';
    hints_used?: number;
    attempts?: number;
  },
  config?: PolicyMiddlewareConfig
) {
  const input: PolicyInput = {
    action,
    user: {
      id: user.id,
      role: user.role,
      plan: user.plan,
      org_id: user.org_id,
      grade_band: user.grade_band,
      workspace_id: user.workspace_id,
    },
    context: {
      ip_address: getClientIp(request),
      user_agent: request.headers.get('user-agent') || undefined,
      timestamp: new Date().toISOString(),
    },
    session,
    policy_config: {
      max_hints: 5,
      answer_reveal_allowed: true,
      safety_level: user.grade_band === 'elementary' ? 'child' : 'teen',
    },
  };

  const result = await evaluateK12Policy(input);

  if (config?.logDecisions) {
    console.log('[OPA K12 Policy]', {
      action,
      userId: user.id,
      allowed: result.decision.allow,
      hintLevel: result.decision.hint_level,
      evaluationTime: result.evaluationTime,
    });
  }

  return {
    allowed: result.decision.allow,
    decision: result.decision,
    evaluationTime: result.evaluationTime,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract client IP from request
 */
function getClientIp(request: NextRequest): string {
  // Check various headers for client IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return '0.0.0.0';
}

/**
 * Generate a random request ID
 */
function generateRequestId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'req_';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Apply PII action to content
 */
export function applyPiiAction(
  content: string,
  action: PiiAction,
  piiDetected: string[]
): { result: string; applied: boolean } {
  if (piiDetected.length === 0 || action === 'allow') {
    return { result: content, applied: false };
  }

  if (action === 'deny') {
    return { result: '', applied: true };
  }

  if (action === 'mask') {
    // Simple masking - in production, use proper PII detection/masking
    let masked = content;

    // Email pattern
    masked = masked.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL]'
    );

    // Phone pattern
    masked = masked.replace(
      /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[PHONE]'
    );

    // SSN pattern
    masked = masked.replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]');

    // Credit card pattern
    masked = masked.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, '[CARD]');

    return { result: masked, applied: true };
  }

  // For 'encrypt' action, content would be encrypted elsewhere
  return { result: content, applied: false };
}

/**
 * Check if request should be audited
 */
export function shouldAudit(decision: PolicyDecision): boolean {
  return decision.audit_required;
}

/**
 * Format policy decision for logging
 */
export function formatDecisionForLog(decision: PolicyDecision): Record<string, unknown> {
  return {
    allow: decision.allow,
    deny_reasons: decision.deny_reasons,
    pii_action: decision.pii_action,
    rate_limit: decision.rate_limit,
    audit: decision.audit_required,
    timestamp: decision.evaluated_at,
  };
}
