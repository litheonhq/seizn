/**
 * Adaptive Planner - Optimization API
 *
 * POST /api/planner/optimize - Run plan optimization
 * GET  /api/planner/optimize - Get plan performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  optimizePlans,
  getPlanPerformance,
  getSelectionHistory,
} from '@/lib/adaptive-planner';
import type {
  OptimizePlanRequest,
  PlanPerformanceResponse,
} from '@/lib/adaptive-planner';

// ============================================
// POST - Run Optimization
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
    let body: OptimizePlanRequest = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK, use defaults
    }

    // Validate parameters if provided
    if (body.minSamples !== undefined) {
      if (typeof body.minSamples !== 'number' || body.minSamples < 1) {
        await logRequest(
          { userId, keyId, endpoint: '/api/planner/optimize', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('minSamples', 'must be a positive number');
      }
    }

    if (body.minSuccessRate !== undefined) {
      if (
        typeof body.minSuccessRate !== 'number' ||
        body.minSuccessRate < 0 ||
        body.minSuccessRate > 1
      ) {
        await logRequest(
          { userId, keyId, endpoint: '/api/planner/optimize', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('minSuccessRate', 'must be a number between 0 and 1');
      }
    }

    // Run optimization
    const result = await optimizePlans(userId, {
      collectionId: body.collectionId,
      minSamples: body.minSamples ?? 10,
      minSuccessRate: body.minSuccessRate ?? 0.8,
      autoApply: body.autoApply ?? false,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/optimize', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: result.success,
      plansCreated: result.plansCreated,
      plansUpdated: result.plansUpdated,
      plansDeactivated: result.plansDeactivated,
      newPlans: result.newPlans,
      recommendations: result.recommendations,
    });
  } catch (error) {
    console.error('Optimize plans error:', error);
    return ServerErrors.internal('optimize plans');
  }
}

// ============================================
// GET - Get Performance Metrics
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
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const planId = searchParams.get('planId') || undefined;

    // Validate days
    if (isNaN(days) || days < 1 || days > 365) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/optimize', method: 'GET', startTime },
        400
      );
      return ValidationErrors.invalidField('days', 'must be a number between 1 and 365');
    }

    // Get performance summaries
    const summaries = await getPlanPerformance(userId, {
      collectionId,
      days,
    });

    // Calculate period dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const response: PlanPerformanceResponse & { history?: unknown[] } = {
      success: true,
      summaries,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
      },
    };

    // Optionally include selection history
    if (includeHistory) {
      const history = await getSelectionHistory(userId, {
        planId,
        limit: 100,
        includeFeatures: false,
      });
      response.history = history;
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/optimize', method: 'GET', startTime },
      200
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get performance error:', error);
    return ServerErrors.internal('get performance');
  }
}
