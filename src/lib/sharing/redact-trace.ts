/**
 * Trace Redaction Logic
 * Masks sensitive data in trace snapshots before sharing
 */

import { maskPII } from '../winter/pii';
import type {
  RedactionProfile,
  TraceSnapshot,
  TraceData,
  TraceEvent,
  TraceCandidate,
} from './types';

// API key and secret patterns
const SECRET_PATTERNS = [
  // Generic API keys
  /\b(sk|pk|api|key|token|secret|password|auth|bearer)[-_]?[a-zA-Z0-9]{16,}\b/gi,
  // Supabase keys
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, // JWT tokens
  // OpenAI keys
  /\bsk-[a-zA-Z0-9]{32,}\b/g,
  // AWS keys
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b[A-Za-z0-9/+=]{40}\b/g, // AWS secret key pattern (careful with false positives)
  // Generic hex secrets (32+ chars)
  /\b[0-9a-f]{32,}\b/gi,
  // Base64 encoded secrets (longer than typical)
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

/**
 * Mask secrets in a string
 */
function maskSecrets(text: string): string {
  if (!text) return text;

  let masked = text;

  for (const pattern of SECRET_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, (match) => {
      // Keep first 4 chars for identification, mask rest
      if (match.length <= 8) {
        return '[SECRET]';
      }
      const prefix = match.slice(0, 4);
      return `${prefix}${'*'.repeat(Math.min(match.length - 4, 20))}`;
    });
  }

  return masked;
}

/**
 * Recursively redact sensitive data in an object
 */
function redactObject(
  obj: unknown,
  profile: RedactionProfile,
  depth = 0
): unknown {
  // Prevent infinite recursion
  if (depth > 20) return obj;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    let result = obj;

    if (profile.pii) {
      const { maskedText } = maskPII(result);
      result = maskedText;
    }

    if (profile.secrets) {
      result = maskSecrets(result);
    }

    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, profile, depth + 1));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip sensitive keys entirely
      const lowerKey = key.toLowerCase();
      if (
        profile.secrets &&
        (lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('token') ||
          lowerKey.includes('key') && !lowerKey.includes('keyboard') && !lowerKey.includes('primary'))
      ) {
        result[key] = '[REDACTED]';
        continue;
      }

      result[key] = redactObject(value, profile, depth + 1);
    }

    return result;
  }

  // Numbers, booleans, etc.
  return obj;
}

/**
 * Redact trace event
 */
function redactEvent(event: TraceEvent, profile: RedactionProfile): TraceEvent {
  const redacted = { ...event };

  if (typeof redacted.input === 'string') {
    redacted.input = redactObject(redacted.input, profile) as string;
  }

  if (typeof redacted.output === 'string') {
    redacted.output = redactObject(redacted.output, profile) as string;
  }

  if (redacted.details) {
    redacted.details = redactObject(redacted.details, profile) as Record<string, unknown>;
  }

  return redacted;
}

/**
 * Redact trace candidate (chunk)
 */
function redactCandidate(
  candidate: TraceCandidate,
  profile: RedactionProfile
): TraceCandidate {
  const redacted = { ...candidate };

  // Hide raw content if requested
  if (profile.raw_content) {
    redacted.content = '[Content hidden for privacy]';
  } else if (redacted.content) {
    redacted.content = redactObject(redacted.content, profile) as string;
  }

  if (redacted.metadata) {
    redacted.metadata = redactObject(redacted.metadata, profile) as Record<string, unknown>;
  }

  return redacted;
}

/**
 * Redact trace data
 */
function redactTraceData(trace: TraceData, profile: RedactionProfile): TraceData {
  const redacted: TraceData = { ...trace };

  if (redacted.events) {
    redacted.events = redacted.events.map((e) => redactEvent(e, profile));
  }

  if (redacted.candidates) {
    redacted.candidates = redacted.candidates.map((c) => redactCandidate(c, profile));
  }

  if (redacted.context) {
    redacted.context = redactObject(redacted.context, profile) as Record<string, unknown>;
  }

  // Redact any other top-level keys
  for (const key of Object.keys(redacted)) {
    if (!['events', 'candidates', 'rerank_deltas', 'context'].includes(key)) {
      redacted[key] = redactObject(redacted[key], profile);
    }
  }

  return redacted;
}

/**
 * Main redaction function - redacts a trace snapshot
 */
export function redactTrace(
  snapshot: TraceSnapshot,
  profile: RedactionProfile
): TraceSnapshot {
  const redacted: TraceSnapshot = { ...snapshot };

  // Redact query text
  if (redacted.query_text) {
    redacted.query_text = redactObject(redacted.query_text, profile) as string;
  }

  // Keep query_hash as is (already hashed)

  // Redact effective config
  if (redacted.effective_config) {
    redacted.effective_config = redactObject(
      redacted.effective_config,
      profile
    ) as Record<string, unknown>;
  }

  // Redact trace data
  if (redacted.trace) {
    redacted.trace = redactTraceData(redacted.trace, profile);
  }

  // Redact error messages
  if (redacted.error) {
    redacted.error = redactObject(redacted.error, profile) as string;
  }

  return redacted;
}

/**
 * Generate secure share token
 */
export function generateShareToken(): string {
  // Use crypto.randomBytes equivalent in browser/node
  const array = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for Node.js
    const { randomBytes } = require('crypto');
    const bytes = randomBytes(32);
    array.set(bytes);
  }

  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Calculate expiration timestamp
 */
export function calculateExpiry(expiresIn: '1h' | '24h' | '7d' | 'never'): Date | null {
  if (expiresIn === 'never') {
    return null;
  }

  const now = new Date();
  switch (expiresIn) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default 24h
  }
}
