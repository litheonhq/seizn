import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildAnthropicHeaders, buildCachedSystemPrompt } from "@/lib/anthropic/prompt-caching";
import { getRedis } from "@/lib/redis";
import { createServerClient, hasServerSupabaseServiceRoleConfig } from "@/lib/supabase";
import { recordUsageEvent } from "@/lib/stripe-metered";
import { logServerError, logServerWarn } from "@/lib/server/logger";
import {
  DEMO_NPC,
  buildDemoSystemPrompt,
  buildFallbackValeReply,
  checkDemoCanonConflict,
  deriveDemoMemory,
  normalizePlaygroundText,
  type PlaygroundMemoryDraft,
} from "@/lib/playground/demo-npc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 8;
const SESSION_LIMIT = 10;
const SESSION_WINDOW_MS = 15 * 60 * 1000;
const DAILY_LIMIT = 10_000;

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface LimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface PersistedMemory {
  id: string | null;
  persisted: boolean;
  createdAt: string;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

const sessionWindows = new Map<string, number[]>();
const dailyCounters = new Map<string, { count: number; resetAt: number }>();

function jsonError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...extra,
      },
    },
    { status }
  );
}

function isPlaygroundEnabled(): boolean {
  return process.env.PLAYGROUND_ENABLED === "1";
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor ||
    "unknown"
  );
}

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function normalizeSessionId(raw: unknown): string {
  if (typeof raw !== "string") return crypto.randomUUID();
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9._:-]{8,96}$/.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

function normalizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): ChatMessage | null => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string") return null;
      const normalized = normalizePlaygroundText(content, MAX_MESSAGE_CHARS);
      if (!normalized) return null;
      return { role, content: normalized };
    })
    .filter((item): item is ChatMessage => item !== null)
    .slice(-MAX_HISTORY_MESSAGES);
}

function normalizeMemoryLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof (item as { content?: unknown }).content === "string") {
        return (item as { content: string }).content;
      }
      return "";
    })
    .map((item) => normalizePlaygroundText(item, 240))
    .filter(Boolean)
    .slice(-10);
}

function checkSlidingLimitMemory(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (sessionWindows.get(key) || []).filter((timestamp) => timestamp > windowStart);

  if (timestamps.length >= limit) {
    const resetAt = timestamps[0] + windowMs;
    sessionWindows.set(key, timestamps);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
    };
  }

  timestamps.push(now);
  sessionWindows.set(key, timestamps);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetAt: timestamps[0] + windowMs,
  };
}

async function checkSlidingLimitRedis(key: string, limit: number, windowMs: number): Promise<LimitResult> {
  const redis = getRedis();
  if (!redis) return checkSlidingLimitMemory(key, limit, windowMs);

  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${crypto.randomUUID()}`;
  const redisKey = `playground:session:${key}`;

  try {
    await redis.zremrangebyscore(redisKey, 0, windowStart);
    await redis.zadd(redisKey, { score: now, member });
    await redis.expire(redisKey, Math.ceil(windowMs / 1000) + 30);

    const count = await redis.zcard(redisKey);
    const oldest = await redis.zrange(redisKey, 0, 0);
    const oldestMember = Array.isArray(oldest) && oldest.length > 0 ? String(oldest[0]) : member;
    const oldestTimestamp = Number.parseInt(oldestMember.split(":")[0] || String(now), 10);
    const resetAt = (Number.isFinite(oldestTimestamp) ? oldestTimestamp : now) + windowMs;

    if (count > limit) {
      await redis.zrem(redisKey, member).catch(() => undefined);
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (error) {
    logServerWarn("[playground/chat] Redis session limit failed, using memory fallback", error);
    return checkSlidingLimitMemory(key, limit, windowMs);
  }
}

function getUtcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getNextUtcDayMs(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function checkDailyLimitMemory(limit: number): LimitResult {
  const now = Date.now();
  const dayKey = getUtcDayKey(new Date(now));
  const resetAt = getNextUtcDayMs(new Date(now));
  const current = dailyCounters.get(dayKey);

  if (!current || current.resetAt <= now) {
    dailyCounters.set(dayKey, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

async function checkDailyLimitRedis(limit: number): Promise<LimitResult> {
  const redis = getRedis();
  if (!redis) return checkDailyLimitMemory(limit);

  const now = Date.now();
  const resetAt = getNextUtcDayMs(new Date(now));
  const redisKey = `playground:daily:${getUtcDayKey(new Date(now))}`;

  try {
    const count = await redis.incr(redisKey);
    await redis.expire(redisKey, Math.ceil((resetAt - now) / 1000) + 30);

    if (count > limit) {
      return { allowed: false, limit, remaining: 0, resetAt };
    }

    return { allowed: true, limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    logServerWarn("[playground/chat] Redis daily cap failed, using memory fallback", error);
    return checkDailyLimitMemory(limit);
  }
}

function rateLimitResponse(code: string, result: LimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  const response = jsonError(
    code,
    code === "daily_cap_exceeded"
      ? "The public playground has reached today's shared message budget. Please try again after the reset."
      : `This session is cooling down. Try again in ${retryAfterSeconds} seconds.`,
    429,
    {
      retryAfterSeconds,
      resetAt: new Date(result.resetAt).toISOString(),
      limit: result.limit,
      remaining: result.remaining,
    }
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return response;
}

async function generateAnthropicReply(input: {
  message: string;
  history: ChatMessage[];
  memories: string[];
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.PLAYGROUND_ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const messages = [
    ...input.history,
    { role: "user" as const, content: input.message },
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 420,
      temperature: 0.6,
      system: buildCachedSystemPrompt(buildDemoSystemPrompt(input.memories)),
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Anthropic playground response failed: ${response.status} ${body.slice(0, 160)}`);
  }

  const parsed = (await response.json()) as AnthropicResponse;
  return parsed.content?.find((block) => block.type === "text" && block.text)?.text?.trim() || null;
}

function getDemoUserId(): string | null {
  return process.env.PLAYGROUND_DEMO_USER_ID || process.env.SEIZN_PLAYGROUND_DEMO_USER_ID || null;
}

function getDemoOrganizationId(): string | null {
  return (
    process.env.PLAYGROUND_DEMO_ORGANIZATION_ID ||
    process.env.SEIZN_PLAYGROUND_DEMO_ORGANIZATION_ID ||
    null
  );
}

async function persistDemoMemory(input: {
  memory: PlaygroundMemoryDraft;
  sessionId: string;
  visitorHash: string;
}): Promise<PersistedMemory> {
  const now = new Date().toISOString();
  const userId = getDemoUserId();
  if (!userId || !hasServerSupabaseServiceRoleConfig()) {
    return { id: null, persisted: false, createdAt: now };
  }

  const supabase = createServerClient();
  const payload: Record<string, unknown> = {
    user_id: userId,
    organization_id: getDemoOrganizationId(),
    content: input.memory.content,
    memory_type: input.memory.memoryType,
    tags: input.memory.tags,
    namespace: DEMO_NPC.namespace,
    scope: "agent",
    session_id: input.sessionId,
    agent_id: DEMO_NPC.id,
    entity_id: DEMO_NPC.id,
    source: "playground",
    confidence: input.memory.confidence,
    importance: input.memory.importance,
    is_encrypted: false,
    is_deleted: false,
    deleted_at: null,
    embedding: null,
  };

  const insert = await supabase
    .from("memories")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (insert.error) {
    logServerWarn("[playground/chat] Demo memory persistence failed", insert.error, {
      sessionId: input.sessionId,
      visitorHash: input.visitorHash,
    });
    return { id: null, persisted: false, createdAt: now };
  }

  const memoryId = String((insert.data as { id: string }).id);
  const createdAt = String((insert.data as { created_at?: string }).created_at || now);

  recordUsageEvent({
    userId,
    dimension: "memories",
    quantity: 1,
    idempotencyKey: `playground-memory:${memoryId}`,
    source: "/api/playground/chat",
    metadata: {
      npc_id: DEMO_NPC.id,
      namespace: DEMO_NPC.namespace,
      session_id: input.sessionId,
    },
  }).catch((error) => {
    logServerError("[playground/chat] Demo memory usage metering failed", error, {
      memoryId,
    });
  });

  return { id: memoryId, persisted: true, createdAt };
}

async function recordPlaygroundOperation(sessionId: string): Promise<void> {
  const userId = getDemoUserId();
  if (!userId) return;

  await recordUsageEvent({
    userId,
    dimension: "ops",
    quantity: 1,
    idempotencyKey: `playground-chat:${sessionId}:${crypto.randomUUID()}`,
    source: "/api/playground/chat",
    metadata: {
      npc_id: DEMO_NPC.id,
      namespace: DEMO_NPC.namespace,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isPlaygroundEnabled()) {
    return jsonError(
      "playground_disabled",
      "The live playground is offline right now. Please try again later.",
      503
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }

  const message =
    typeof body.message === "string"
      ? normalizePlaygroundText(body.message, MAX_MESSAGE_CHARS)
      : "";
  if (!message) {
    return jsonError("missing_message", "Message is required.", 400);
  }

  const sessionId = normalizeSessionId(body.sessionId || request.headers.get("x-playground-session"));
  const visitorHash = hashIdentifier(getClientIp(request));
  const sessionKey = `${visitorHash}:${hashIdentifier(sessionId)}`;
  const sessionLimit = await checkSlidingLimitRedis(sessionKey, SESSION_LIMIT, SESSION_WINDOW_MS);
  if (!sessionLimit.allowed) {
    return rateLimitResponse("session_rate_limited", sessionLimit);
  }

  const dailyLimit = await checkDailyLimitRedis(DAILY_LIMIT);
  if (!dailyLimit.allowed) {
    return rateLimitResponse("daily_cap_exceeded", dailyLimit);
  }

  const history = normalizeHistory(body.history);
  const clientMemories = normalizeMemoryLines(body.memories);
  const memoryDraft = deriveDemoMemory(message);
  const memoryLines = memoryDraft
    ? [...clientMemories, memoryDraft.content].slice(-10)
    : clientMemories;

  let reply: string | null = null;
  try {
    reply = await generateAnthropicReply({ message, history, memories: memoryLines });
  } catch (error) {
    logServerWarn("[playground/chat] Anthropic generation failed, using deterministic fallback", error);
  }

  const safeReply = reply && !checkDemoCanonConflict(reply)
    ? reply
    : buildFallbackValeReply({ message, memories: memoryLines });

  const persisted = memoryDraft
    ? await persistDemoMemory({ memory: memoryDraft, sessionId, visitorHash })
    : { id: null, persisted: false, createdAt: new Date().toISOString() };

  recordPlaygroundOperation(sessionId).catch((error) => {
    logServerError("[playground/chat] Demo ops usage metering failed", error, { sessionId });
  });

  return NextResponse.json({
    success: true,
    data: {
      message: safeReply,
      memory: memoryDraft
        ? {
            id: persisted.id || crypto.randomUUID(),
            content: memoryDraft.content,
            memoryType: memoryDraft.memoryType,
            tags: memoryDraft.tags,
            confidence: memoryDraft.confidence,
            importance: memoryDraft.importance,
            createdAt: persisted.createdAt,
            persisted: persisted.persisted,
          }
        : null,
      npc: {
        id: DEMO_NPC.id,
        name: DEMO_NPC.name,
        title: DEMO_NPC.title,
      },
      session: {
        id: sessionId,
        limit: sessionLimit.limit,
        remaining: sessionLimit.remaining,
        resetAt: new Date(sessionLimit.resetAt).toISOString(),
        windowSeconds: Math.ceil(SESSION_WINDOW_MS / 1000),
      },
    },
  });
}
