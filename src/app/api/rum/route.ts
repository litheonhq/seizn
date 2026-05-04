import { NextRequest, NextResponse } from "next/server";

type RumMetric = {
  id: string;
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  navigationType?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  entryType?: string;
  attribution?: unknown;
};

const MAX_RUM_PAYLOAD_BYTES = 16_384;
const MAX_STRING_LENGTH = 320;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 24;
const MAX_DEPTH = 4;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (getUtf8ByteLength(rawBody) > MAX_RUM_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }

    const metric = JSON.parse(rawBody) as RumMetric;

    if (!isValidMetric(metric)) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const sanitizedMetric = sanitizeMetric(metric);

    if (process.env.NODE_ENV !== "production") {
      console.info("[RUM]", sanitizedMetric);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "parse_error" }, { status: 400 });
  }
}

function isValidMetric(metric: RumMetric) {
  return (
    typeof metric?.id === "string" &&
    typeof metric.name === "string" &&
    metric.name.length > 0 &&
    Number.isFinite(metric.value)
  );
}

function sanitizeMetric(metric: RumMetric): RumMetric {
  return {
    id: truncate(metric.id) ?? "",
    name: truncate(metric.name) ?? "",
    value: metric.value,
    rating: truncate(metric.rating),
    delta: sanitizeNumber(metric.delta),
    navigationType: truncate(metric.navigationType),
    url: sanitizePath(metric.url),
    userAgent: truncate(metric.userAgent),
    timestamp: truncate(metric.timestamp),
    entryType: truncate(metric.entryType),
    attribution: sanitizeValue(metric.attribution),
  };
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number") return sanitizeNumber(value);
  if (typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, entryValue]) => [truncate(key), sanitizeValue(entryValue, depth + 1)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  return undefined;
}

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizePath(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  return value.split("?")[0].slice(0, MAX_STRING_LENGTH);
}

function truncate(value: unknown) {
  return typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : undefined;
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
