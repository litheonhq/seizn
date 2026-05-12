const REDACTED = '[REDACTED]';
const TRUNCATED = '[Truncated]';
const MAX_DEPTH = 4;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 20;

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[_-]?key|jwt|signature|credential|private[_-]?key|client[_-]?secret|session)/i;

const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:token|key|api_key|apikey|secret|signature|sig|password|client_secret)=)[^&\s]+/gi;
const API_KEY_PATTERN = /\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/g;
const ANTHROPIC_API_KEY_PATTERN = /\bsk-ant-api03-[A-Za-z0-9_-]+\b/g;
const OPENAI_PROJECT_API_KEY_PATTERN = /\bsk-proj-[A-Za-z0-9_-]+\b/g;
const OPENAI_SERVICE_ACCOUNT_KEY_PATTERN = /\bsk-svcacct-[A-Za-z0-9_-]+\b/g;
const PLAIN_SK_API_KEY_PATTERN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g;
const VOYAGE_API_KEY_PATTERN = /\bpa-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g;
const GITHUB_TOKEN_PATTERN = /\b(?:gh(?:o|p|u|s|r)_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g;
const GOOGLE_API_KEY_PATTERN = /\bAIza[A-Za-z0-9_-]{35}\b/g;
// Cohere keys do not have a stable public prefix; contextual fields such as
// COHERE_API_KEY are covered by SENSITIVE_ASSIGNMENT_PATTERN / key redaction.
const SENSITIVE_ASSIGNMENT_PATTERN =
  /((?:authorization|token|secret|password|api[_-]?key|cookie|client[_-]?secret)\s*[:=]\s*["']?)[^"',\s]+/gi;

const EMAIL_PATTERN =
  /([a-zA-Z0-9._%+-]{1,64})@([a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63})/g;

function shouldEmitLogs(): boolean {
  return (
    process.env.NODE_ENV !== 'test' ||
    process.env.CODEX_ENABLE_TEST_LOGS === '1'
  );
}

function redactString(value: string): string {
  let redacted = value;

  redacted = redacted.replace(BEARER_TOKEN_PATTERN, REDACTED);
  redacted = redacted.replace(JWT_PATTERN, REDACTED);
  redacted = redacted.replace(
    SECRET_QUERY_PARAM_PATTERN,
    (_, prefix: string) => `${prefix}${REDACTED}`
  );
  redacted = redacted.replace(API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(ANTHROPIC_API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(OPENAI_PROJECT_API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(OPENAI_SERVICE_ACCOUNT_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(PLAIN_SK_API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(VOYAGE_API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(SUPABASE_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(GITHUB_TOKEN_PATTERN, REDACTED);
  redacted = redacted.replace(GOOGLE_API_KEY_PATTERN, REDACTED);
  redacted = redacted.replace(
    SENSITIVE_ASSIGNMENT_PATTERN,
    (_, prefix: string) => `${prefix}${REDACTED}`
  );

  redacted = redacted.replace(EMAIL_PATTERN, REDACTED);

  if (redacted.length > MAX_STRING_LENGTH) {
    return `${redacted.slice(0, MAX_STRING_LENGTH)} ${TRUNCATED}`;
  }

  return redacted;
}

function sanitizeObject(
  value: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED];
      }

      return [key, sanitizeForLogs(entryValue, depth + 1)];
    })
  );
}

function sanitizeError(error: Error, depth: number): Record<string, unknown> {
  const maybeWithCode = error as Error & { code?: unknown; cause?: unknown };
  const payload: Record<string, unknown> = {
    name: error.name,
    message: redactString(error.message),
  };

  if (error.stack) {
    payload.stack = redactString(error.stack);
  }

  if (maybeWithCode.code !== undefined) {
    payload.code = sanitizeForLogs(maybeWithCode.code, depth + 1);
  }

  if (maybeWithCode.cause !== undefined) {
    payload.cause = sanitizeForLogs(maybeWithCode.cause, depth + 1);
  }

  return payload;
}

export function sanitizeForLogs(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return TRUNCATED;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (value instanceof Error) {
    return sanitizeError(value, depth);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeForLogs(entry, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, depth);
  }

  return String(value);
}

function log(
  level: 'error' | 'warn',
  message: string,
  detail?: unknown,
  context?: Record<string, unknown>
) {
  if (!shouldEmitLogs()) {
    return;
  }

  if (detail === undefined && !context) {
    console[level](message);
    return;
  }

  const payload: Record<string, unknown> = {};

  if (detail !== undefined) {
    payload.detail = sanitizeForLogs(detail);
  }

  if (context && Object.keys(context).length > 0) {
    payload.context = sanitizeForLogs(context);
  }

  console[level](message, payload);
}

export function logServerError(
  message: string,
  detail?: unknown,
  context?: Record<string, unknown>
) {
  log('error', message, detail, context);
}

export function logServerWarn(
  message: string,
  detail?: unknown,
  context?: Record<string, unknown>
) {
  log('warn', message, detail, context);
}
