import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { SeiznApiClient } from "../client.js";

export interface SeiznTool {
  definition: Tool;
  handle(client: SeiznApiClient, args: Record<string, unknown>): Promise<unknown>;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => optionalString(item))
    .filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

export function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
