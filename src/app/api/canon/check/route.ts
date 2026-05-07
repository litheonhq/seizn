import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authErrorResponse, isAuthError } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { listCanonLocks } from "@/lib/canon/enforce";
import { validateCanonContent } from "@/lib/canon/validator";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { logServerError } from "@/lib/server/logger";
import { createServerClient } from "@/lib/supabase";
import { checkFeatureGate, recordFeatureUsage } from "@/lib/author/billing/feature-gate";
import { recordFirstFunnelEvent } from "@/lib/analytics/funnel";

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
            message: "No organization is available for canon validation",
          },
        },
        { status: 400 }
      ),
    };
  }

  return { userId, keyId, organizationId };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeContent(body: Record<string, unknown>): string | null {
  return normalizeOptionalString(
    body.proposed_content ??
      body.proposedContent ??
      body.content ??
      body.memory ??
      body.text
  );
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveContext(request);
    if ("error" in context) return context.error;

    // v9 Free tier gate: 5 Check operations per calendar month.
    const gate = await checkFeatureGate({ userId: context.userId, feature: 'check' });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: gate.reason,
            message:
              gate.reason === 'free_check_limit_exceeded'
                ? `Free tier limit reached (${gate.cap} Checks/month). Upgrade to Charter for unlimited.`
                : 'Feature unavailable on Free tier.',
          },
        },
        { status: 402 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const proposedContent = normalizeContent(body);
    if (!proposedContent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "proposed_content_required",
            message: "proposed_content is required",
          },
        },
        { status: 400 }
      );
    }

    const npcId = normalizeOptionalString(body.npc_id ?? body.npcId);
    const supabase = createServerClient();
    const locks = (await listCanonLocks(context.organizationId, supabase)).filter(
      (lock) => lock.active && (!lock.npcId || (npcId && lock.npcId === npcId))
    );
    const result = await validateCanonContent({ content: proposedContent, locks });

    // v9 funnel + usage tracking. Free users hit a 5/mo cap; Charter users
    // bypass the cap but we still record for analytics.
    await recordFeatureUsage({ userId: context.userId, feature: 'check' });
    void recordFirstFunnelEvent({ userId: context.userId, eventType: 'first_check' });

    return NextResponse.json({
      success: true,
      data: {
        ok: result.ok,
        npcId,
        locksChecked: locks.length,
        verdict: result.verdict,
        violation: result.ok ? null : result.violation,
      },
    });
  } catch (error) {
    logServerError("[api/canon/check] POST failed", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "canon_check_failed",
          message: "Failed to check Canon Locks",
        },
      },
      { status: 500 }
    );
  }
}
