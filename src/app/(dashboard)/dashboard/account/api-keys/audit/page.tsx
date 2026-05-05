import type { Metadata } from "next";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import DashboardShell from "@/components/dashboard/DashboardShell";
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
  return (
    <DashboardShell>
      <AuditClient entries={entries} />
    </DashboardShell>
  );
}
