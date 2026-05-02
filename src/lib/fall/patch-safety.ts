const FORBIDDEN_PATCH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class UnsafePatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePatchError';
  }
}

export function isPatchRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertSafePatchValue(value: unknown, path = 'patch'): void {
  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePatchValue(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      throw new UnsafePatchError(`Unsafe patch key rejected: ${path}.${key}`);
    }
    assertSafePatchValue(nested, `${path}.${key}`);
  }
}

export function applySafeStatePatch<T extends object>(
  state: T,
  patch: Record<string, unknown>
): T {
  assertSafePatchValue(patch);
  const result = JSON.parse(JSON.stringify(state ?? {})) as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'messages' && Array.isArray(value)) {
      result.messages = value;
    } else if (key === 'context' && isPatchRecord(value)) {
      const context = isPatchRecord(result.context) ? result.context : {};
      result.context = { ...context, ...value };
    } else if (key === 'memory' && isPatchRecord(value)) {
      const memory = isPatchRecord(result.memory) ? result.memory : {};
      result.memory = { ...memory, ...value };
    } else if (key === 'toolCalls' && Array.isArray(value)) {
      result.toolCalls = value;
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
