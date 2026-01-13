/**
 * Seizn Relay Authentication
 *
 * Handles agent key generation, HMAC signing, and signature verification
 * for secure communication between Seizn cloud and relay agents.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { RelayProtocolRequest, RelayCallbackRequest } from './protocol';

// ============================================
// Constants
// ============================================

const AGENT_KEY_PREFIX = 'szn_relay_';
const AGENT_KEY_LENGTH = 32; // bytes
const SIGNATURE_ALGORITHM = 'sha256';
const SIGNATURE_ENCODING = 'hex' as const;

// ============================================
// Agent Key Generation
// ============================================

/**
 * Generate a new secure agent key
 * Format: szn_relay_<32 random bytes in base64url>
 */
export function generateAgentKey(): string {
  const randomPart = randomBytes(AGENT_KEY_LENGTH)
    .toString('base64url')
    .replace(/[=]/g, '');
  return `${AGENT_KEY_PREFIX}${randomPart}`;
}

/**
 * Validate agent key format
 */
export function isValidAgentKey(key: string): boolean {
  if (!key.startsWith(AGENT_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(AGENT_KEY_PREFIX.length);
  // Base64url characters only, reasonable length
  return /^[A-Za-z0-9_-]{32,64}$/.test(keyPart);
}

/**
 * Hash an agent key for storage
 * We store the hash, not the plaintext key
 */
export function hashAgentKey(key: string): string {
  return createHmac(SIGNATURE_ALGORITHM, 'seizn-relay-key-hash')
    .update(key)
    .digest(SIGNATURE_ENCODING);
}

/**
 * Verify an agent key against its hash
 */
export function verifyAgentKeyHash(key: string, hash: string): boolean {
  const computedHash = hashAgentKey(key);
  try {
    return timingSafeEqual(
      Buffer.from(computedHash, SIGNATURE_ENCODING),
      Buffer.from(hash, SIGNATURE_ENCODING)
    );
  } catch {
    return false;
  }
}

// ============================================
// Request Signing
// ============================================

/**
 * Sign a relay request with the agent key
 * Creates an HMAC-SHA256 signature of the request body
 */
export function signRequest(
  request: Omit<RelayProtocolRequest, 'signature'>,
  agentKey: string
): string {
  const payload = canonicalizeRequest(request);
  return createHmac(SIGNATURE_ALGORITHM, agentKey)
    .update(payload)
    .digest(SIGNATURE_ENCODING);
}

/**
 * Verify a relay request signature
 */
export function verifyRequestSignature(
  request: RelayProtocolRequest,
  agentKey: string
): boolean {
  if (!request.signature) {
    return false;
  }

  const { signature, ...requestWithoutSig } = request;
  const expectedSignature = signRequest(requestWithoutSig, agentKey);

  try {
    return timingSafeEqual(
      Buffer.from(signature, SIGNATURE_ENCODING),
      Buffer.from(expectedSignature, SIGNATURE_ENCODING)
    );
  } catch {
    return false;
  }
}

/**
 * Sign a callback request from relay to Seizn
 */
export function signCallbackRequest(
  request: Omit<RelayCallbackRequest, 'signature'>,
  agentKey: string
): string {
  const payload = JSON.stringify({
    requestId: request.requestId,
    agentKey: request.agentKey,
    response: request.response,
  });

  return createHmac(SIGNATURE_ALGORITHM, agentKey)
    .update(payload)
    .digest(SIGNATURE_ENCODING);
}

/**
 * Verify a callback request signature
 */
export function verifyCallbackSignature(
  request: RelayCallbackRequest,
  agentKey: string
): boolean {
  const { signature, ...requestWithoutSig } = request;
  const expectedSignature = signCallbackRequest(requestWithoutSig, agentKey);

  try {
    return timingSafeEqual(
      Buffer.from(signature, SIGNATURE_ENCODING),
      Buffer.from(expectedSignature, SIGNATURE_ENCODING)
    );
  } catch {
    return false;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Canonicalize a request for signing
 * Ensures consistent ordering of fields for reproducible signatures
 */
function canonicalizeRequest(
  request: Omit<RelayProtocolRequest, 'signature'>
): string {
  const canonical = {
    version: request.version,
    requestId: request.requestId,
    action: request.action,
    timestamp: request.timestamp,
    // Sort payload keys if present
    payload: request.payload ? sortObjectKeys(request.payload) : undefined,
  };

  return JSON.stringify(canonical);
}

/**
 * Recursively sort object keys for consistent serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted;
}

/**
 * Generate a short-lived token for callback authentication
 * This is used for additional security in callback mode
 */
export function generateCallbackToken(
  requestId: string,
  agentKey: string,
  expiresInMs: number = 300000 // 5 minutes default
): string {
  const expiresAt = Date.now() + expiresInMs;
  const payload = `${requestId}:${expiresAt}`;

  const signature = createHmac(SIGNATURE_ALGORITHM, agentKey)
    .update(payload)
    .digest(SIGNATURE_ENCODING);

  // Format: base64(payload):signature
  const encodedPayload = Buffer.from(payload).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Verify a callback token
 */
export function verifyCallbackToken(
  token: string,
  requestId: string,
  agentKey: string
): { valid: boolean; expired: boolean } {
  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return { valid: false, expired: false };
    }

    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const [tokenRequestId, expiresAtStr] = payload.split(':');

    // Verify request ID matches
    if (tokenRequestId !== requestId) {
      return { valid: false, expired: false };
    }

    // Verify signature
    const expectedSignature = createHmac(SIGNATURE_ALGORITHM, agentKey)
      .update(payload)
      .digest(SIGNATURE_ENCODING);

    const signatureValid = timingSafeEqual(
      Buffer.from(signature, SIGNATURE_ENCODING),
      Buffer.from(expectedSignature, SIGNATURE_ENCODING)
    );

    if (!signatureValid) {
      return { valid: false, expired: false };
    }

    // Check expiration
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) {
      return { valid: false, expired: true };
    }

    return { valid: true, expired: false };
  } catch {
    return { valid: false, expired: false };
  }
}

/**
 * Mask an agent key for display (show only first 12 chars + last 4)
 */
export function maskAgentKey(key: string): string {
  if (key.length <= 20) {
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  }
  return key.substring(0, 12) + '...' + key.substring(key.length - 4);
}
