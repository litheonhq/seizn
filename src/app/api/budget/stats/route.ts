import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

/**
 * GET /api/budget/stats
 * Get current user's budget usage statistics
 */
export async function GET() {
  const context = createRequestContext();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const supabase = createServerClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get budget settings
    const { data: settings } = await supabase
      .from("retrieval_budgets")
      .select("daily_budget_usd, monthly_budget_usd")
      .eq("user_id", session.user.id)
      .single();

    // Get today's usage from traces
    const { data: todayTraces } = await supabase
      .from("flight_recorder_traces")
      .select("cost_usd")
      .eq("user_id", session.user.id)
      .gte("created_at", todayStart.toISOString());

    // Get monthly usage from traces
    const { data: monthTraces } = await supabase
      .from("flight_recorder_traces")
      .select("cost_usd")
      .eq("user_id", session.user.id)
      .gte("created_at", monthStart.toISOString());

    // Get degrade events count
    const { count: degradeEvents } = await supabase
      .from("budget_degrade_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .gte("created_at", todayStart.toISOString());

    // Get last degrade reason
    const { data: lastDegrade } = await supabase
      .from("budget_degrade_events")
      .select("reason")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Calculate totals
    const dailyUsedUsd = todayTraces?.reduce((sum, t) => sum + (t.cost_usd || 0), 0) || 0;
    const monthlyUsedUsd = monthTraces?.reduce((sum, t) => sum + (t.cost_usd || 0), 0) || 0;

    const stats = {
      dailyUsedUsd,
      monthlyUsedUsd,
      dailyBudgetUsd: settings?.daily_budget_usd || 10.0,
      monthlyBudgetUsd: settings?.monthly_budget_usd || 100.0,
      todayQueries: todayTraces?.length || 0,
      monthQueries: monthTraces?.length || 0,
      degradeEvents: degradeEvents || 0,
      lastDegradeReason: lastDegrade?.reason || null,
    };

    return successResponse({ stats }, context);
  } catch (error) {
    console.error("Budget stats API error:", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
