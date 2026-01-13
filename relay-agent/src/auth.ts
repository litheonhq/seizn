/**
 * Seizn Relay Agent - Authentication
 *
 * HMAC signing and verification for secure communication.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { RelayProtocolRequest, RelayProtocolResponse } from './types.js';

const SIGNATURE_ALGORITHM = 'sha256';
const SIGNATURE_ENCODING = 'hex' as const;

/**
 * Sign a relay request with the agent key
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
 * Sign a callback response
 */
export function signCallbackRequest(
  requestId: string,
  agentKey: string,
  response: RelayProtocolResponse
): string {
  const payload = JSON.stringify({
    requestId,
    agentKey,
    response,
  });

  return createHmac(SIGNATURE_ALGORITHM, agentKey)
    .update(payload)
    .digest(SIGNATURE_ENCODING);
}

/**
 * Canonicalize a request for signing
 */
function canonicalizeRequest(
  request: Omit<RelayProtocolRequest, 'signature'>
): string {
  const canonical = {
    version: request.version,
    requestId: request.requestId,
    action: request.action,
    timestamp: request.timestamp,
    payload: request.payload ? sortObjectKeys(request.payload) : undefined,
  };

  return JSON.stringify(canonical);
}

/**
 * Recursively sort object keys
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
