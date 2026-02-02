/**
 * Winter OPA Policy API
 *
 * POST /api/winter/policy/opa - Evaluate policies
 * GET  /api/winter/policy/opa - List Rego policies
 *
 * @description
 * Provides OPA (Open Policy Agent) compatible policy evaluation
 * using Rego policy definitions. Supports:
 * - Access control decisions
 * - Data governance rules
 * - Rate limiting checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getOpaPolicyService,
  listRegoPolicies,
  ALL_POLICY_TEMPLATES,
  type OpaInput,
  type OpaPrincipal,
  type OpaResource,
  type OpaAction,
  type OpaContext,
  type RegoPolicyCategory,
} from '@/lib/winter/opa';

// ============================================
// Auth Helper
// ============================================

async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ============================================
// POST /api/winter/policy/opa
// Evaluate policies against input
// ============================================

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      input,
      categories,
      policyIds,
      includeAllDecisions,
      checkType,
    } = body as {
      input?: OpaInput;
      categories?: RegoPolicyCategory[];
      policyIds?: string[];
      includeAllDecisions?: boolean;
      checkType?: 'access' | 'governance' | 'rate_limit';
    };

    const service = getOpaPolicyService();

    // Handle specific check types
    if (checkType === 'rate_limit') {
      const principal: OpaPrincipal = input?.principal || {
        type: 'user',
        id: user.id,
      };

      const result = await service.checkRateLimit(
        principal,
        input?.action?.endpoint
      );

      return NextResponse.json({
        success: true,
        decision: {
          allow: result.allowed,
          reason: result.allowed
            ? undefined
            : `Rate limit exceeded. Retry after ${result.retryAfterSeconds} seconds.`,
        },
        rateLimit: {
          remaining: result.remaining,
          resetAt: result.resetAt,
          retryAfterSeconds: result.retryAfterSeconds,
          appliedRule: result.appliedRule,
        },
      });
    }

    // Validate input
    if (!input) {
      return NextResponse.json(
        { error: 'Input is required for policy evaluation' },
        { status: 400 }
      );
    }

    // Build complete input with defaults
    const fullInput: OpaInput = {
      principal: input.principal || {
        type: 'user',
        id: user.id,
      },
      resource: input.resource,
      action: input.action || { operation: 'read' },
      context: {
        timestamp: new Date().toISOString(),
        ipAddress: request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
        userAgent: request.headers.get('user-agent') || undefined,
        requestId: crypto.randomUUID(),
        ...input.context,
      },
      data: input.data,
    };

    // Handle specific check types
    if (checkType === 'access' && fullInput.resource) {
      const decision = await service.checkAccess(
        fullInput.principal,
        fullInput.resource,
        fullInput.action.operation,
        fullInput.context
      );

      return NextResponse.json({
        success: true,
        decision,
      });
    }

    if (checkType === 'governance' && fullInput.resource) {
      const decision = await service.checkDataGovernance(
        fullInput.principal,
        fullInput.resource,
        fullInput.action.operation,
        fullInput.data
      );

      return NextResponse.json({
        success: true,
        decision,
      });
    }

    // Full policy evaluation
    const response = await service.evaluate({
      input: fullInput,
      categories,
      policyIds,
      includeAllDecisions,
    });

    return NextResponse.json({
      success: true,
      decision: response.decision,
      policyDecisions: response.policyDecisions,
      stats: response.stats,
    });
  } catch (error) {
    console.error('[Winter OPA] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// GET /api/winter/policy/opa
// List policies and templates
// ============================================

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const category = searchParams.get('category') as RegoPolicyCategory | null;
    const isActive = searchParams.get('is_active');
    const includeTemplates = searchParams.get('include_templates') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // If no org ID, just return templates
    if (!organizationId) {
      if (includeTemplates) {
        const templates = category
          ? ALL_POLICY_TEMPLATES.filter((t) => t.category === category)
          : ALL_POLICY_TEMPLATES;

        return NextResponse.json({
          success: true,
          templates,
        });
      }

      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400 }
      );
    }

    // List policies
    const result = await listRegoPolicies({
      organizationId,
      category: category || undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit,
      offset,
    });

    // Include templates if requested
    let templates = null;
    if (includeTemplates) {
      templates = category
        ? ALL_POLICY_TEMPLATES.filter((t) => t.category === category)
        : ALL_POLICY_TEMPLATES;
    }

    return NextResponse.json({
      success: true,
      policies: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
      ...(templates && { templates }),
    });
  } catch (error) {
    console.error('[Winter OPA] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
