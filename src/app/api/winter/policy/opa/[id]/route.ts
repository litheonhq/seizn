/**
 * Winter OPA Policy Management API
 *
 * GET    /api/winter/policy/opa/[id] - Get policy details
 * PATCH  /api/winter/policy/opa/[id] - Update policy
 * DELETE /api/winter/policy/opa/[id] - Delete policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getRegoPolicy,
  updateRegoPolicy,
  deleteRegoPolicy,
  activateRegoPolicy,
  deactivateRegoPolicy,
  testPolicy,
  getPolicyVersionHistory,
  rollbackPolicy,
  getOpaPolicyEngine,
} from '@/lib/winter/opa';
import { logServerError } from '@/lib/server/logger';

// ============================================
// Auth Helper
// ============================================


interface RouteContext {
  params: Promise<{ id: string }>;
}

// ============================================
// GET /api/winter/policy/opa/[id]
// Get policy details
// ============================================

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('include_history') === 'true';
    const validateOnly = searchParams.get('validate') === 'true';

    const policy = await getRegoPolicy(id);

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    // Validate policy if requested
    let validation = null;
    if (validateOnly) {
      const engine = getOpaPolicyEngine();
      validation = engine.validatePolicy(policy.regoCode);
    }

    // Get version history if requested
    let history = null;
    if (includeHistory) {
      history = await getPolicyVersionHistory(id);
    }

    return NextResponse.json({
      success: true,
      policy,
      ...(validation && { validation }),
      ...(history && { history }),
    });
  } catch (error) {
    logServerError('[Winter OPA] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/winter/policy/opa/[id]
// Update policy
// ============================================

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const {
      name,
      description,
      regoCode,
      priority,
      scope,
      isActive,
      action,
      testCases,
      rollbackToVersion,
    } = body;

    // Handle special actions
    if (action === 'activate') {
      const policy = await activateRegoPolicy(id, user.id);
      return NextResponse.json({
        success: true,
        policy,
        message: 'Policy activated successfully',
      });
    }

    if (action === 'deactivate') {
      const policy = await deactivateRegoPolicy(id, user.id);
      return NextResponse.json({
        success: true,
        policy,
        message: 'Policy deactivated successfully',
      });
    }

    if (action === 'test' && testCases) {
      const policy = await getRegoPolicy(id);
      if (!policy) {
        return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
      }

      const testResults = await testPolicy(policy.regoCode, testCases);
      return NextResponse.json({
        success: true,
        testResults,
      });
    }

    if (action === 'validate') {
      const policy = await getRegoPolicy(id);
      if (!policy) {
        return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
      }

      const engine = getOpaPolicyEngine();
      const validation = engine.validatePolicy(regoCode || policy.regoCode);
      return NextResponse.json({
        success: true,
        validation,
      });
    }

    if (action === 'rollback' && rollbackToVersion !== undefined) {
      const policy = await rollbackPolicy(id, rollbackToVersion, user.id);
      return NextResponse.json({
        success: true,
        policy,
        message: `Policy rolled back to version ${rollbackToVersion}`,
      });
    }

    // Standard update
    const policy = await updateRegoPolicy(
      {
        id,
        name,
        description,
        regoCode,
        priority,
        scope,
        isActive,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      policy,
    });
  } catch (error) {
    logServerError('[Winter OPA] PATCH error:', error);

    if (error instanceof Error && error.message.includes('Invalid policy syntax')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE /api/winter/policy/opa/[id]
// Delete policy
// ============================================

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    await deleteRegoPolicy(id, user.id);

    return NextResponse.json({
      success: true,
      deleted: id,
    });
  } catch (error) {
    logServerError('[Winter OPA] DELETE error:', error);

    if (error instanceof Error && error.message === 'Policy not found') {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
