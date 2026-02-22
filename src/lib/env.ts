/**
 * Environment variable sanitization helpers.
 * Removes invisible/control characters (including UTF-8 BOM) that can break auth headers.
 */

const INVISIBLE_ENV_CHARS = /[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g;

export function sanitizeEnvValue(raw: string): string {
  return raw.replace(INVISIBLE_ENV_CHARS, '').trim();
}

export function getSanitizedEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string') return undefined;

  const sanitized = sanitizeEnvValue(raw);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function getSanitizedEnvOrThrow(key: string): string {
  const value = getSanitizedEnv(key);
  if (!value) {
    throw new Error(`${key} not set`);
  }
  return value;
}

