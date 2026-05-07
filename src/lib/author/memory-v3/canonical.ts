import { createHash } from 'node:crypto';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Keys that must NEVER be copied into the canonical accumulator. Even with
 * `Object.create(null)` skipping `__proto__` is defense-in-depth; assignment
 * to `__proto__` on a plain `{}` literal mutates the new object's prototype
 * in V8, and downstream JSON consumers may re-materialize plain objects.
 * `constructor` and `prototype` are excluded for the same class of attack.
 */
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function canonicalize(value: unknown, seen: WeakSet<object> = new WeakSet()): JsonValue {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value.map((item) => canonicalize(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    // Object.create(null) prevents `sorted['__proto__'] = ...` from mutating
    // the prototype of the accumulator. The cast back to a plain Record is
    // safe — JSON.stringify treats null-proto objects identically.
    const sorted = Object.create(null) as Record<string, JsonValue>;

    for (const key of Object.keys(record).sort()) {
      if (POLLUTION_KEYS.has(key)) {
        // Skip prototype-pollution surface keys — they have no business in
        // canonical author records and we don't want them in hash inputs.
        continue;
      }
      const item = record[key];
      if (item !== undefined) {
        sorted[key] = canonicalize(item, seen);
      }
    }

    return sorted;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return String(value);
    }

    return value;
  }

  return String(value);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
