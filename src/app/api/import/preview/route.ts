import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createImportPreview, parseCompetitorImportSource } from "@/lib/import/server";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { logServerError } from "@/lib/server/logger";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Login required" } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const source = parseCompetitorImportSource(body.source);
    const content = typeof body.content === "string" ? body.content : "";
    const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim() : null;

    if (!source) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_source", message: "source must be inworld, convai, or rivet" } },
        { status: 400 }
      );
    }
    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "empty_import", message: "Import file content is required" } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: session.user.id,
      keyId: null,
    });
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: { code: "organization_required", message: "No organization is available for import" } },
        { status: 400 }
      );
    }

    const result = await createImportPreview(
      { supabase, userId: session.user.id, organizationId },
      { source, content, filename }
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError("[api/import/preview] failed", error);
    const message = error instanceof SyntaxError ? "Import content must be valid JSON" : "Failed to preview import";
    return NextResponse.json(
      { success: false, error: { code: "import_preview_failed", message } },
      { status: error instanceof SyntaxError ? 400 : 500 }
    );
  }
}
