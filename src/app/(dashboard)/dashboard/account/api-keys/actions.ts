"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  generateApiKey,
  recordAudit,
  rotateApiKey as rotateApiKeyService,
} from "@/lib/api-keys";
import { V9_TRACK2_QUOTA, type V9Track2Tier, isV9Track2Tier } from "@/lib/billing/v9-products";
import {
  buildTrack2StateFromProfile,
  type Track2ProfileRow,
} from "@/lib/billing/track2-subscription-state";
import {
  TRACK_2_KEY_CAP_PER_USER,
  type CreateApiKeyResult,
  type RevokeApiKeyResult,
  type RotateApiKeyResult,
} from "./constants";

const DEFAULT_SCOPES = V9_TRACK2_QUOTA.free.scopes;
const ALLOWED_SCOPES = new Set([
  "*",
  "recall",
  "remember",
  "graph",
  "search",
  "check",
  "timeline",
  "usage",
  "projects:read",
  "projects:write",
  "audit:read",
  "managed_llm",
]);

function sanitizeName(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 80);
}

function sanitizeScopes(input: unknown): string[] {
  if (!Array.isArray(input)) return [...DEFAULT_SCOPES];
  const normalized = input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => ALLOWED_SCOPES.has(value));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_SCOPES];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeRecordAudit(
  input: Parameters<typeof recordAudit>[0],
  operation: string,
): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[track2-api-keys] audit log failed", {
        operation,
        action: input.action,
        apiKeyId: input.apiKeyId ?? null,
        message: errorMessage(error),
      });
    }
  }
}

export async function createApiKey(input: {
  name: string;
  scopes?: string[];
}): Promise<CreateApiKeyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: "unauthorized" };
  }
  const userId = session.user.id;

  const name = sanitizeName(input.name);
  if (!name) {
    return { ok: false, code: "invalid_name", detail: "Name is required (1-80 chars)." };
  }

  const supabase = createServerClient();

  const { count, error: countError } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (countError) {
    return { ok: false, code: "internal_error", detail: countError.message };
  }

  if ((count ?? 0) >= TRACK_2_KEY_CAP_PER_USER) {
    return { ok: false, code: "cap_reached" };
  }

  const generated = generateApiKey();
  const scopes = sanitizeScopes(input.scopes);
  // Resolve the user's actual paid tier from existing api_keys (webhook
  // already wrote tier-defining quota on subscription.created). If the
  // user has no prior key OR is on Free, fall back to V9_TRACK2_QUOTA.free.
  // Pre-fix this hardcoded Free, so a paying Pro user creating a fresh
  // key got 50/day instead of 10K/month until the next webhook fire.
  const profileTierQuota = await resolveProfileTrack2Quota(userId, supabase);

  const { data: priorKeys } = await supabase
    .from("api_keys")
    .select("monthly_quota, monthly_quota_period")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .limit(1);
  let tierQuota = profileTierQuota ?? V9_TRACK2_QUOTA.free;
  const priorRow = (priorKeys ?? [])[0] as
    | { monthly_quota: number | null; monthly_quota_period: string | null }
    | undefined;
  if (!profileTierQuota && priorRow && priorRow.monthly_quota != null && priorRow.monthly_quota_period) {
    // Match the prior row's quota to a known v9 tier. If the user is on
    // Indie/Pro/Studio/StudioManaged/Enterprise the prior key carries the
    // tier-defining quota. Reverse-lookup so a new key inherits.
    for (const tier of Object.keys(V9_TRACK2_QUOTA) as V9Track2Tier[]) {
      const q = V9_TRACK2_QUOTA[tier];
      if (
        q.monthlyQuota === priorRow.monthly_quota &&
        q.monthlyQuotaPeriod === priorRow.monthly_quota_period &&
        isV9Track2Tier(tier)
      ) {
        tierQuota = q;
        break;
      }
    }
  }

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      org_id: null,
      name,
      prefix: generated.prefix,
      key_prefix: generated.prefix,
      hash: generated.hash,
      key_hash: generated.hash,
      scopes,
      rate_limit_per_minute: tierQuota.rateLimitPerMinute,
      monthly_quota: tierQuota.monthlyQuota,
      monthly_quota_period: tierQuota.monthlyQuotaPeriod,
      is_active: true,
    })
    .select("id, prefix, name, scopes, created_at")
    .single();

  if (error || !data) {
    return { ok: false, code: "internal_error", detail: error?.message ?? "insert returned no row" };
  }

  await safeRecordAudit({
    apiKeyId: data.id,
    userId,
    action: "created",
    metadata: { name: data.name, scopes: data.scopes },
    supabase,
  }, "create");

  revalidatePath("/dashboard/account/api-keys");
  revalidatePath("/dashboard/account/api-keys/audit");

  return {
    ok: true,
    id: data.id,
    key: generated.key,
    prefix: data.prefix,
    name: data.name,
    scopes: data.scopes,
    createdAt: data.created_at,
  };
}

async function resolveProfileTrack2Quota(
  userId: string,
  supabase: ReturnType<typeof createServerClient>,
) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select([
        "track2_tier",
        "track2_subscription_id",
        "track2_subscription_status",
        "track2_price_id",
        "track2_billing_cadence",
        "track2_price_lock_version",
        "track2_current_period_start",
        "track2_current_period_end",
        "track2_subscription_renews_at",
        "track2_subscription_cancelled",
        "track2_subscription_payment_failed",
        "track2_subscription_payment_failed_at",
      ].join(","))
      .eq("id", userId)
      .single<Track2ProfileRow>();

    const track2 = data ? buildTrack2StateFromProfile(data) : null;
    if (!track2 || track2.status === "cancelled" || track2.status === "incomplete") {
      return null;
    }
    return V9_TRACK2_QUOTA[track2.tier];
  } catch {
    return null;
  }
}

export async function revokeApiKey(id: string): Promise<RevokeApiKeyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: "unauthorized" };
  }
  const userId = session.user.id;
  const supabase = createServerClient();

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: now, is_active: false })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, code: "internal_error", detail: error.message };
  }
  if (!data) {
    return { ok: false, code: "not_found" };
  }

  await safeRecordAudit({
    apiKeyId: data.id,
    userId,
    action: "revoked",
    metadata: {},
    supabase,
  }, "revoke");

  revalidatePath("/dashboard/account/api-keys");
  revalidatePath("/dashboard/account/api-keys/audit");

  return { ok: true, id: data.id };
}

export async function rotateApiKey(id: string): Promise<RotateApiKeyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: "unauthorized" };
  }
  const userId = session.user.id;
  const supabase = createServerClient();

  const { data: original, error: lookupError } = await supabase
    .from("api_keys")
    .select("id, name, scopes")
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, code: "internal_error", detail: lookupError.message };
  }
  if (!original) {
    return { ok: false, code: "not_found" };
  }

  try {
    const result = await rotateApiKeyService({
      oldKeyId: id,
      userId,
      name: original.name,
      scopes: original.scopes,
      supabase,
    });
    revalidatePath("/dashboard/account/api-keys");
    revalidatePath("/dashboard/account/api-keys/audit");
    return {
      ok: true,
      id: result.id,
      key: result.key,
      prefix: result.prefix,
      rotatedFromId: result.rotatedFromId,
    };
  } catch (error) {
    return {
      ok: false,
      code: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
