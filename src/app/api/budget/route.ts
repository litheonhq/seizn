/**
 * Budget Settings API
 *
 * GET /api/budget - Get current budget status
 * PATCH /api/budget - Update budget settings
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  checkBudget,
  updateBudgetSettings,
  type BudgetSettings,
} from '@/lib/budget-planner';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/budget
 *
 * Get current budget status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const status = await checkBudget(auth.userId);

    return NextResponse.json({
      success: true,
      budget: {
        daily_budget_usd: status.dailyBudget,
        monthly_budget_usd: status.monthlyBudget,
        per_query_max_usd: status.perQueryMax,
        daily_spent_usd: status.dailySpent,
        monthly_spent_usd: status.monthlySpent,
        daily_remaining_usd: status.dailyRemaining,
        monthly_remaining_usd: status.monthlyRemaining,
        daily_usage_pct: status.dailyUsagePct,
        monthly_usage_pct: status.monthlyUsagePct,
        mode: status.mode,
        fallback_strategy: status.fallbackStrategy,
        is_over_daily: status.isOverDaily,
        is_over_monthly: status.isOverMonthly,
        alert_at_percent: status.alertAtPercent,
      },
    }, {
      headers: auth.rateLimitHeaders,
    });
  } catch (error) {
    logServerError('Get budget failed', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BUDGET_ERROR',
          message: 'Failed to retrieve budget status',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/budget
 *
 * Update budget settings for the authenticated user.
 *
 * Body:
 * {
 *   "daily_budget_usd": 10.0,
 *   "monthly_budget_usd": 100.0,
 *   "per_query_max_usd": 0.05,
 *   "alert_at_percent": 80,
 *   "mode": "soft" | "hard",
 *   "fallback_strategy": "degrade" | "reject" | "queue"
 * }
 */
export async function PATCH(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const body = await request.json();

    // Validate and map settings
    const settings: Partial<BudgetSettings> = {};

    if (body.daily_budget_usd !== undefined) {
      const value = parseFloat(body.daily_budget_usd);
      if (isNaN(value) || value < 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'daily_budget_usd must be a non-negative number',
            },
          },
          { status: 400 }
        );
      }
      settings.dailyBudgetUsd = value;
    }

    if (body.monthly_budget_usd !== undefined) {
      const value = parseFloat(body.monthly_budget_usd);
      if (isNaN(value) || value < 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'monthly_budget_usd must be a non-negative number',
            },
          },
          { status: 400 }
        );
      }
      settings.monthlyBudgetUsd = value;
    }

    if (body.per_query_max_usd !== undefined) {
      const value = parseFloat(body.per_query_max_usd);
      if (isNaN(value) || value < 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'per_query_max_usd must be a non-negative number',
            },
          },
          { status: 400 }
        );
      }
      settings.perQueryMaxUsd = value;
    }

    if (body.alert_at_percent !== undefined) {
      const value = parseInt(body.alert_at_percent);
      if (isNaN(value) || value < 0 || value > 100) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'alert_at_percent must be between 0 and 100',
            },
          },
          { status: 400 }
        );
      }
      settings.alertAtPercent = value;
    }

    if (body.mode !== undefined) {
      if (!['soft', 'hard'].includes(body.mode)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'mode must be "soft" or "hard"',
            },
          },
          { status: 400 }
        );
      }
      settings.mode = body.mode;
    }

    if (body.fallback_strategy !== undefined) {
      if (!['degrade', 'reject', 'queue'].includes(body.fallback_strategy)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'fallback_strategy must be "degrade", "reject", or "queue"',
            },
          },
          { status: 400 }
        );
      }
      settings.fallbackStrategy = body.fallback_strategy;
    }

    // Update settings
    const status = await updateBudgetSettings(auth.userId, settings);

    return NextResponse.json({
      success: true,
      budget: {
        daily_budget_usd: status.dailyBudget,
        monthly_budget_usd: status.monthlyBudget,
        per_query_max_usd: status.perQueryMax,
        daily_spent_usd: status.dailySpent,
        monthly_spent_usd: status.monthlySpent,
        daily_remaining_usd: status.dailyRemaining,
        monthly_remaining_usd: status.monthlyRemaining,
        daily_usage_pct: status.dailyUsagePct,
        monthly_usage_pct: status.monthlyUsagePct,
        mode: status.mode,
        fallback_strategy: status.fallbackStrategy,
        is_over_daily: status.isOverDaily,
        is_over_monthly: status.isOverMonthly,
        alert_at_percent: status.alertAtPercent,
      },
    }, {
      headers: auth.rateLimitHeaders,
    });
  } catch (error) {
    logServerError('Update budget failed', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BUDGET_ERROR',
          message: 'Failed to update budget settings',
        },
      },
      { status: 500 }
    );
  }
}
