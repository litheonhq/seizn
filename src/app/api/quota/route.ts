import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";
import { getEffectivePlan, getPlan } from "@/lib/plan-limits";
import { upsertProfileWithFallback } from "@/lib/profile/upsert";

/**
 * GET /api/quota
 * Get current user's quota usage and limits for billing dashboard
 */
export async function GET() {
  const context = createRequestContext();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const supabase = createServerClient();
    const userId = session.user.id;

    // Get user profile
    const { data: initialProfile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, memory_count, subscription_ends_at, subscription_cancelled")
      .eq("id", userId)
      .maybeSingle();
    let profile = initialProfile;

    if (profileError) {
      console.error("Failed to fetch profile:", profileError);
      return errorResponse({ code: "SEIZN_405", message: "Failed to fetch profile", status: 500 }, context);
    }

    // Auto-heal for legacy users missing a profile row.
    if (!profile) {
      const profileInit = await upsertProfileWithFallback(
        supabase,
        userId,
        session.user.email ?? null,
        session.user.name ?? undefined
      );
      if (!profileInit.ok) {
        console.error("Failed to auto-heal missing profile:", profileInit.error);
        return errorResponse(
          { code: "SEIZN_405", message: "Failed to initialize profile", status: 500 },
          context
        );
      }

      const refetch = await supabase
        .from("profiles")
        .select("plan, memory_count, subscription_ends_at, subscription_cancelled")
        .eq("id", userId)
        .maybeSingle();
      profile = refetch.data ?? {
        plan: "free",
        memory_count: 0,
        subscription_ends_at: null,
        subscription_cancelled: false,
      };
    }

    // Get effective plan considering subscription expiry
    const effectivePlan = getEffectivePlan({
      plan: profile?.plan || "free",
      subscription_ends_at: profile?.subscription_ends_at,
    });

    const planConfig = getPlan(effectivePlan);
    const uiLimits = { memories: planConfig.memories, apiCalls: planConfig.apiCallsMonthly, apiKeys: planConfig.apiKeys };

    // Get API call count for this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { count: apiCallsThisMonth } = await supabase
      .from("usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", firstDayOfMonth.toISOString());

    // Get active API keys count
    const { count: apiKeysCount } = await supabase
      .from("api_keys")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true);

    const memoryCount = profile?.memory_count || 0;
    const callsThisMonth = apiCallsThisMonth || 0;
    const keysCount = apiKeysCount || 0;

    return successResponse({
      plan: effectivePlan,
      memories: {
        used: memoryCount,
        limit: uiLimits.memories,
      },
      apiCalls: {
        used: callsThisMonth,
        limit: uiLimits.apiCalls,
      },
      apiKeys: {
        used: keysCount,
        limit: uiLimits.apiKeys,
      },
      subscription: {
        endsAt: profile?.subscription_ends_at || null,
        cancelled: profile?.subscription_cancelled || false,
      },
    }, context);
  } catch (error) {
    console.error("Quota API error:", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
