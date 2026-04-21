import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { commitImportJob, loadImportJob, rollbackImportJob } from "@/lib/import/server";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { logServerError } from "@/lib/server/logger";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

async function resolveContext() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: "unauthorized", message: "Login required" } },
        { status: 401 }
      ),
    };
  }

  const supabase = createServerClient();
  const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
    userId: session.user.id,
    keyId: null,
  });

  if (!organizationId) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: "organization_required", message: "No organization is available for import" } },
        { status: 400 }
      ),
    };
  }

  return { ctx: { supabase, userId: session.user.id, organizationId } };
}

function normalizeJobId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveContext();
    if ("error" in context) return context.error;

    const jobId = normalizeJobId(request.nextUrl.searchParams.get("jobId"));
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: { code: "job_id_required", message: "jobId is required" } },
        { status: 400 }
      );
    }

    const job = await loadImportJob(context.ctx, jobId);
    return NextResponse.json({ success: true, data: { job } });
  } catch (error) {
    logServerError("[api/import/commit] GET failed", error);
    return NextResponse.json(
      { success: false, error: { code: "import_job_load_failed", message: "Failed to load import job" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveContext();
    if ("error" in context) return context.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = normalizeJobId(body.jobId);
    const action = body.action === "rollback" ? "rollback" : "commit";

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: { code: "job_id_required", message: "jobId is required" } },
        { status: 400 }
      );
    }

    const result = action === "rollback"
      ? await rollbackImportJob(context.ctx, jobId)
      : await commitImportJob(context.ctx, jobId);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError("[api/import/commit] POST failed", error);
    return NextResponse.json(
      { success: false, error: { code: "import_commit_failed", message: "Failed to update import job" } },
      { status: 500 }
    );
  }
}
