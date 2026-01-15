/**
 * Tenant Policy API
 *
 * GET    /api/tenant-policy - Get tenant policy
 * POST   /api/tenant-policy - Create/update tenant policy
 * DELETE /api/tenant-policy - Reset to default preset
 *
 * Query params:
 * - tenant_id: Tenant identifier (required)
 * - include_budget: Include current budget state (default: false)
 * - include_presets: Include available presets (default: false)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getTenantPolicy,
  getTenantBudgetState,
  invalidatePolicyCache,

  listPresets,
  createTenantPolicy,
  applyDegradeLadder,
  getDegradeSummary,
  getBudgetStatusColor,
  calculateBudgetUsage,
  type TenantPolicy,
  type PresetName,
} from "@/lib/tenant-policy";

// Helper to get user from session token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Helper to check admin access
async function checkAdminAccess(_userId: string, _tenantId: string): Promise<boolean> {

  // TODO: Implement proper org/tenant role check
  // For now, allow all authenticated users
  return true;
}

/**
 * GET /api/tenant-policy
 * Get tenant policy and optionally budget state
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenant_id");
    const includeBudget = searchParams.get("include_budget") === "true";
    const includePresets = searchParams.get("include_presets") === "true";
    const includeDegrade = searchParams.get("include_degrade") === "true";

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 }
      );
    }

    // Get policy
    const policy = await getTenantPolicy(tenantId);

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      policy,
    };

    // Include budget state if requested
    if (includeBudget || includeDegrade) {
      const budgetState = await getTenantBudgetState(policy, tenantId);
      response.budget_state = budgetState;
      response.budget_usage = calculateBudgetUsage(budgetState, policy);
      response.budget_status_color = getBudgetStatusColor(budgetState);

      // Include degrade info if requested
      if (includeDegrade) {
        const degradeResult = applyDegradeLadder(policy, budgetState);
        response.degrade = {
          level: degradeResult.degradeLevel,
          summary: getDegradeSummary(degradeResult),
          effective_policy: degradeResult.effectivePolicy,
          next_degrade_at: degradeResult.nextDegradeAt,
        };
      }
    }

    // Include presets if requested
    if (includePresets) {
      response.presets = listPresets();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[TenantPolicy] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tenant-policy
 * Create or update tenant policy
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_id, preset, policy: customPolicy } = body;

    if (!tenant_id) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 }
      );
    }

    // Check admin access
    const hasAccess = await checkAdminAccess(user.id, tenant_id);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Not authorized to manage this tenant's policy" },
        { status: 403 }
      );
    }

    let newPolicy: TenantPolicy;

    if (preset) {
      // Create from preset
      const validPresets: PresetName[] = [
        "ultra_conservative",
        "conservative",
        "aggressive",
      ];
      if (!validPresets.includes(preset)) {
        return NextResponse.json(
          {
            error: `Invalid preset. Valid options: ${validPresets.join(", ")}`,
          },
          { status: 400 }
        );
      }
      newPolicy = createTenantPolicy(tenant_id, preset as PresetName);
    } else if (customPolicy) {
      // Use custom policy
      newPolicy = {
        ...customPolicy,
        tenant: tenant_id,
      };

      // Validate required fields
      if (!newPolicy.caps || !newPolicy.summer || !newPolicy.degrade_ladder) {
        return NextResponse.json(
          { error: "Invalid policy: missing required fields (caps, summer, degrade_ladder)" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Either preset or policy must be provided" },
        { status: 400 }
      );
    }

    // TODO: Save to DB when prisma is available
    // const saved = await savePolicyToDB(tenant_id, newPolicy, prisma);

    // For now, just invalidate cache so next request picks up env changes
    invalidatePolicyCache(tenant_id);

    return NextResponse.json({
      success: true,
      policy: newPolicy,
      message: preset
        ? `Policy created from ${preset} preset`
        : "Custom policy applied",
    });
  } catch (error) {
    console.error("[TenantPolicy] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tenant-policy
 * Reset tenant policy to default preset
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenant_id");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 }
      );
    }

    // Check admin access
    const hasAccess = await checkAdminAccess(user.id, tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Not authorized to manage this tenant's policy" },
        { status: 403 }
      );
    }

    // Invalidate cache to reset to default
    invalidatePolicyCache(tenantId);

    // Get default policy
    const defaultPolicy = createTenantPolicy(tenantId, "conservative");

    return NextResponse.json({
      success: true,
      policy: defaultPolicy,
      message: "Policy reset to conservative preset",
    });
  } catch (error) {
    console.error("[TenantPolicy] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
