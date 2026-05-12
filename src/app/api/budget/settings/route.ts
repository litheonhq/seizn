import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";
import { DEFAULT_BUDGET_SETTINGS } from "@/lib/budget-planner/types";
import { logServerError } from "@/lib/server/logger";
import { verifyCsrfToken } from "@/lib/csrf";

/**
 * GET /api/budget/settings
 * Get current user's budget settings
 */
export async function GET() {
  const context = createRequestContext();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("retrieval_budgets")
      .select("daily_budget_usd, monthly_budget_usd, per_query_max_usd, alert_at_percent, mode, fallback_strategy")
      .eq("user_id", session.user.id)
      .single();

    // PGRST116: "No rows found". PGRST205: "Table not found" (dev DB not migrated yet).
    if (error && error.code !== "PGRST116" && error.code !== "PGRST205") {
      logServerError("Failed to fetch budget settings", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to fetch settings", status: 500 }, context);
    }

    const settings = data
      ? {
        dailyBudgetUsd: data.daily_budget_usd ?? DEFAULT_BUDGET_SETTINGS.dailyBudgetUsd,
        monthlyBudgetUsd: data.monthly_budget_usd ?? DEFAULT_BUDGET_SETTINGS.monthlyBudgetUsd,
        perQueryMaxUsd: data.per_query_max_usd ?? DEFAULT_BUDGET_SETTINGS.perQueryMaxUsd,
        alertAtPercent: data.alert_at_percent ?? DEFAULT_BUDGET_SETTINGS.alertAtPercent,
        mode: data.mode ?? DEFAULT_BUDGET_SETTINGS.mode,
        fallbackStrategy: data.fallback_strategy ?? DEFAULT_BUDGET_SETTINGS.fallbackStrategy,
      }
      : DEFAULT_BUDGET_SETTINGS;

    return successResponse({ settings }, context);
  } catch (error) {
    logServerError("Budget settings GET failed", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}

/**
 * PUT /api/budget/settings
 * Update user's budget settings
 */
export async function PUT(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const csrfError = verifyCsrfToken(request);
    if (csrfError) return csrfError;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const body = await request.json();
    const {
      dailyBudgetUsd,
      monthlyBudgetUsd,
      perQueryMaxUsd,
      alertAtPercent,
      mode,
      fallbackStrategy,
    } = body;

    // Validate
    if (dailyBudgetUsd !== undefined && (typeof dailyBudgetUsd !== "number" || dailyBudgetUsd < 0)) {
      return errorResponse({ code: "SEIZN_201", message: "dailyBudgetUsd must be a non-negative number", status: 400 }, context);
    }
    if (monthlyBudgetUsd !== undefined && (typeof monthlyBudgetUsd !== "number" || monthlyBudgetUsd < 0)) {
      return errorResponse({ code: "SEIZN_201", message: "monthlyBudgetUsd must be a non-negative number", status: 400 }, context);
    }
    if (perQueryMaxUsd !== undefined && (typeof perQueryMaxUsd !== "number" || perQueryMaxUsd < 0)) {
      return errorResponse({ code: "SEIZN_201", message: "perQueryMaxUsd must be a non-negative number", status: 400 }, context);
    }
    if (alertAtPercent !== undefined && (typeof alertAtPercent !== "number" || alertAtPercent < 0 || alertAtPercent > 100)) {
      return errorResponse({ code: "SEIZN_202", message: "alertAtPercent must be between 0 and 100", status: 400 }, context);
    }
    if (mode !== undefined && !["soft", "hard"].includes(mode)) {
      return errorResponse({ code: "SEIZN_209", message: "mode must be 'soft' or 'hard'", status: 400 }, context);
    }
    if (fallbackStrategy !== undefined && !["degrade", "reject", "queue"].includes(fallbackStrategy)) {
      return errorResponse({ code: "SEIZN_209", message: "fallbackStrategy must be 'degrade', 'reject', or 'queue'", status: 400 }, context);
    }

    const supabase = createServerClient();

    // Upsert settings
    const { error } = await supabase
      .from("retrieval_budgets")
      .upsert(
        {
          user_id: session.user.id,
          daily_budget_usd: dailyBudgetUsd,
          monthly_budget_usd: monthlyBudgetUsd,
          per_query_max_usd: perQueryMaxUsd,
          alert_at_percent: alertAtPercent,
          mode,
          fallback_strategy: fallbackStrategy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      logServerError("Failed to update budget settings", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to save settings", status: 500 }, context);
    }

    return successResponse({ message: "Settings updated successfully" }, context);
  } catch (error) {
    logServerError("Budget settings PATCH failed", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
