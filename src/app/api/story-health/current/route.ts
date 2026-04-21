import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authErrorResponse, isAuthError } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { logServerError } from "@/lib/server/logger";
import {
  getStoryHealthAct,
  listStoryHealthSnapshots,
} from "@/lib/story-health/metrics";
import { createServerClient } from "@/lib/supabase";

async function resolveContext(request: NextRequest): Promise<
  | { userId: string; keyId: string | null; organizationId: string }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  let userId: string | null = null;
  let keyId: string | null = null;

  if (!isAuthError(authResult)) {
    userId = authResult.userId;
    keyId = authResult.keyId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: authErrorResponse(authResult.authError) };
    }
    userId = session.user.id;
  }

  const supabase = createServerClient();
  const organizationId = await resolveMemoryBudgetOrganizationId(supabase, { userId, keyId });
  if (!organizationId) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: "organization_required",
            message: "No organization is available for Story Health",
          },
        },
        { status: 400 }
      ),
    };
  }

  return { userId, keyId, organizationId };
}

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "30", 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 180);
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveContext(request);
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const act = searchParams.get("act")?.trim() || null;
    const limit = normalizeLimit(searchParams.get("limit"));
    const supabase = createServerClient();

    const snapshots = act
      ? await getStoryHealthAct(context.organizationId, act, supabase, limit)
      : await listStoryHealthSnapshots(context.organizationId, supabase, { limit });

    return NextResponse.json({
      success: true,
      data: {
        act,
        current: snapshots[0] ?? null,
        snapshots,
        count: snapshots.length,
      },
    });
  } catch (error) {
    logServerError("[api/story-health/current] GET failed", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "story_health_current_unavailable",
          message: "Failed to load Story Health snapshots",
        },
      },
      { status: 500 }
    );
  }
}
