/**
 * Adaptive Planner - Plans CRUD API
 *
 * GET    /api/planner/plans - List plans
 * POST   /api/planner/plans - Create new plan
 * PUT    /api/planner/plans - Update plan
 * DELETE /api/planner/plans - Delete plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  getUserPlans as _getUserPlans,
  getDefaultPlans,
  rowToQueryPlan,
} from '@/lib/adaptive-planner';
import type {
  CreatePlanRequest,
  UpdatePlanRequest,
  QueryPlanRow,
  ListPlansResponse,
} from '@/lib/adaptive-planner';

// ============================================
// GET - List Plans
// ============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const collectionId = searchParams.get('collectionId') || undefined;
    const includeDefaults = searchParams.get('includeDefaults') !== 'false';
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    // Fetch plans
    const supabase = createServerClient();

    let queryBuilder = supabase
      .from('query_plans')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: false });

    if (activeOnly) {
      queryBuilder = queryBuilder.eq('is_active', true);
    }

    if (collectionId) {
      queryBuilder = queryBuilder.or(`collection_id.eq.${collectionId},collection_id.is.null`);
    }

    const { data: plans, error } = await queryBuilder;

    if (error) {
      console.error('Failed to fetch plans:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'GET', startTime },
        500
      );
      return ServerErrors.internal('fetch plans');
    }

    // Optionally include defaults
    let defaults;
    if (includeDefaults) {
      defaults = await getDefaultPlans();
    }

    const response: ListPlansResponse = {
      success: true,
      plans: (plans as QueryPlanRow[]).map(rowToQueryPlan),
      defaults: defaults,
      total: plans.length,
    };

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/plans', method: 'GET', startTime },
      200
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('List plans error:', error);
    return ServerErrors.internal('list plans');
  }
}

// ============================================
// POST - Create Plan
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse body
    const body: CreatePlanRequest = await request.json();

    // Validate required fields
    if (!body.planName || typeof body.planName !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('planName');
    }

    if (!body.planConfig || typeof body.planConfig !== 'object') {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('planConfig');
    }

    // Validate planConfig structure
    const config = body.planConfig;
    if (typeof config.topK !== 'number' || config.topK < 1 || config.topK > 100) {
      return ValidationErrors.invalidField('planConfig.topK', 'must be a number between 1 and 100');
    }

    const supabase = createServerClient();

    // Create the plan
    const insertData = {
      user_id: userId,
      collection_id: body.collectionId || null,
      plan_name: body.planName.trim(),
      plan_config: body.planConfig,
      query_patterns: body.queryPatterns || null,
      query_intents: body.queryIntents || null,
      min_query_length: body.minQueryLength || null,
      max_query_length: body.maxQueryLength || null,
      priority: body.priority ?? 50,
      is_active: true,
    };

    const { data: plan, error } = await supabase
      .from('query_plans')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create plan:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        await logRequest(
          { userId, keyId, endpoint: '/api/planner/plans', method: 'POST', startTime },
          409
        );
        return NextResponse.json(
          { success: false, error: 'A plan with this name already exists for this collection' },
          { status: 409 }
        );
      }

      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'POST', startTime },
        500
      );
      return ServerErrors.internal('create plan');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/plans', method: 'POST', startTime },
      201
    );

    return NextResponse.json({
      success: true,
      plan: rowToQueryPlan(plan as QueryPlanRow),
    }, { status: 201 });
  } catch (error) {
    console.error('Create plan error:', error);
    return ServerErrors.internal('create plan');
  }
}

// ============================================
// PUT - Update Plan
// ============================================

export async function PUT(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse body
    const body: UpdatePlanRequest & { id: string } = await request.json();

    // Validate plan ID
    if (!body.id || typeof body.id !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'PUT', startTime },
        400
      );
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('query_plans')
      .select('id, user_id')
      .eq('id', body.id)
      .single();

    if (fetchError || !existing) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'PUT', startTime },
        404
      );
      return NextResponse.json(
        { success: false, error: 'Plan not found' },
        { status: 404 }
      );
    }

    if (existing.user_id !== userId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'PUT', startTime },
        403
      );
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this plan' },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.planName !== undefined) {
      updateData.plan_name = body.planName.trim();
    }
    if (body.planConfig !== undefined) {
      // Merge with existing config
      const { data: currentPlan } = await supabase
        .from('query_plans')
        .select('plan_config')
        .eq('id', body.id)
        .single();

      if (currentPlan) {
        updateData.plan_config = { ...currentPlan.plan_config, ...body.planConfig };
      } else {
        updateData.plan_config = body.planConfig;
      }
    }
    if (body.queryPatterns !== undefined) {
      updateData.query_patterns = body.queryPatterns;
    }
    if (body.queryIntents !== undefined) {
      updateData.query_intents = body.queryIntents;
    }
    if (body.minQueryLength !== undefined) {
      updateData.min_query_length = body.minQueryLength;
    }
    if (body.maxQueryLength !== undefined) {
      updateData.max_query_length = body.maxQueryLength;
    }
    if (body.priority !== undefined) {
      updateData.priority = body.priority;
    }
    if (body.isActive !== undefined) {
      updateData.is_active = body.isActive;
    }

    // Update the plan
    const { data: updatedPlan, error: updateError } = await supabase
      .from('query_plans')
      .update(updateData)
      .eq('id', body.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Failed to update plan:', updateError);
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'PUT', startTime },
        500
      );
      return ServerErrors.internal('update plan');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/plans', method: 'PUT', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      plan: rowToQueryPlan(updatedPlan as QueryPlanRow),
    });
  } catch (error) {
    console.error('Update plan error:', error);
    return ServerErrors.internal('update plan');
  }
}

// ============================================
// DELETE - Delete Plan
// ============================================

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Get plan ID from query params
    const searchParams = request.nextUrl.searchParams;
    const planId = searchParams.get('id');

    if (!planId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'DELETE', startTime },
        400
      );
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('query_plans')
      .select('id, user_id')
      .eq('id', planId)
      .single();

    if (fetchError || !existing) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'DELETE', startTime },
        404
      );
      return NextResponse.json(
        { success: false, error: 'Plan not found' },
        { status: 404 }
      );
    }

    if (existing.user_id !== userId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'DELETE', startTime },
        403
      );
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this plan' },
        { status: 403 }
      );
    }

    // Delete the plan
    const { error: deleteError } = await supabase
      .from('query_plans')
      .delete()
      .eq('id', planId);

    if (deleteError) {
      console.error('Failed to delete plan:', deleteError);
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/plans', method: 'DELETE', startTime },
        500
      );
      return ServerErrors.internal('delete plan');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/plans', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: planId,
    });
  } catch (error) {
    console.error('Delete plan error:', error);
    return ServerErrors.internal('delete plan');
  }
}
