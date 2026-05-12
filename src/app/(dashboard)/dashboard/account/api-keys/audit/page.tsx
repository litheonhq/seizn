import type { Metadata } from "next";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import { getDashboardCapabilities } from "@/lib/dashboard-capabilities";
import AuditClient from "./audit-client";
import type { ApiKeyAuditAction } from "@/lib/api-keys";

export const metadata: Metadata = {
  title: "API key audit log — Seizn",
  description: "Track 2 API key audit events: create, revoke, rotate, rate limit, quota, scope.",
  robots: { index: false, follow: false },
};

export type AuditEntry = {
  id: number;
  apiKeyId: string | null;
  action: ApiKeyAuditAction;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

const PAGE_LIMIT = 200;

async function loadAudit(userId: string): Promise<AuditEntry[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("api_key_audit_log")
    .select("id, api_key_id, action, metadata, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error || !data) {
    return [];
  }

  type AuditRow = {
    id: number;
    api_key_id: string | null;
    action: string;
    metadata: Record<string, unknown> | null;
    occurred_at: string;
  };

  return (data as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    apiKeyId: row.api_key_id,
    action: row.action as ApiKeyAuditAction,
    metadata: row.metadata ?? {},
    occurredAt: row.occurred_at,
  }));
}

export default async function ApiKeysAuditPage() {
  const { user } = await getAuthOrReview();
  const entries = user.id === "review" ? [] : await loadAudit(user.id);
  const userName = user.name ?? user.email ?? "Author";
  return (
    <WorkspaceShell
      userName={userName}
      userPlanLabel="Studio"
      currentLabel="API key audit"
      capabilities={getDashboardCapabilities(user)}
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)]">
        <AuditClient entries={entries} />
      </main>
    </WorkspaceShell>
  );
}
