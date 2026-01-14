import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

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
      .from("budget_settings")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch budget settings:", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to fetch settings", status: 500 }, context);
    }

    // Return default settings if not set
    const settings = data || {
      dailyBudgetUsd: 10.0,
      monthlyBudgetUsd: 100.0,
      perQueryMaxUsd: 0.05,
      alertAtPercent: 80,
      mode: "soft",
      fallbackStrategy: "degrade",
    };

    return successResponse({ settings }, context);
  } catch (error) {
    console.error("Budget settings API error:", error);
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
      .from("budget_settings")
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
      console.error("Failed to update budget settings:", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to save settings", status: 500 }, context);
    }

    return successResponse({ message: "Settings updated successfully" }, context);
  } catch (error) {
    console.error("Budget settings API error:", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
