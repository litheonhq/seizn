/**
 * Policy Pack Signing & Verification
 *
 * Cryptographic signing and verification for policy pack integrity.
 */

import crypto from 'crypto';

// ============================================
// Types
// ============================================

export interface SigningKey {
  keyId: string;
  publicKey: string;
  algorithm: 'RS256' | 'ES256' | 'Ed25519';
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface SignatureInfo {
  signature: string;
  keyId: string;
  algorithm: string;
  signedAt: string;
  contentHash: string;
}

export interface VerificationResult {
  valid: boolean;
  keyId?: string;
  signedAt?: string;
  error?: string;
  warnings?: string[];
}

// ============================================
// Built-in Seizn Public Keys
// ============================================

const SEIZN_PUBLIC_KEYS: SigningKey[] = [
  {
    keyId: 'seizn-policy-2026-01',
    publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0placeholder0
-----END PUBLIC KEY-----`,
    algorithm: 'RS256',
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
  },
];

// ============================================
// Content Hashing
// ============================================

/**
 * Compute canonical hash of policy content
 */
export function computeContentHash(policies: unknown): string {
  // Canonical JSON (sorted keys, no whitespace)
  const canonical = JSON.stringify(policies, Object.keys(policies as object).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify content hash matches
 */
export function verifyContentHash(policies: unknown, expectedHash: string): boolean {
  const actualHash = computeContentHash(policies);
  return crypto.timingSafeEqual(
    Buffer.from(actualHash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
}

// ============================================
// Signature Verification
// ============================================

/**
 * Verify a policy pack signature
 */
export function verifySignature(
  content: unknown,
  signatureInfo: SignatureInfo,
  trustedKeys: SigningKey[] = SEIZN_PUBLIC_KEYS
): VerificationResult {
  const warnings: string[] = [];

  // Find the signing key
  const key = trustedKeys.find((k) => k.keyId === signatureInfo.keyId);

  if (!key) {
    return {
      valid: false,
      error: `Unknown signing key: ${signatureInfo.keyId}`,
    };
  }

  // Check key is active
  if (!key.isActive) {
    return {
      valid: false,
      keyId: key.keyId,
      error: 'Signing key is no longer active',
    };
  }

  // Check key expiration
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return {
      valid: false,
      keyId: key.keyId,
      error: 'Signing key has expired',
    };
  }

  // Check algorithm matches
  if (key.algorithm !== signatureInfo.algorithm) {
    return {
      valid: false,
      keyId: key.keyId,
      error: `Algorithm mismatch: expected ${key.algorithm}, got ${signatureInfo.algorithm}`,
    };
  }

  // Verify content hash
  const contentHash = computeContentHash(content);
  if (contentHash !== signatureInfo.contentHash) {
    return {
      valid: false,
      keyId: key.keyId,
      error: 'Content hash mismatch - policy content has been modified',
    };
  }

  try {
    // Verify cryptographic signature
    const verifier = crypto.createVerify(key.algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
    verifier.update(signatureInfo.contentHash);
    verifier.end();

    const isValid = verifier.verify(key.publicKey, signatureInfo.signature, 'base64');

    if (!isValid) {
      return {
        valid: false,
        keyId: key.keyId,
        error: 'Invalid signature',
      };
    }

    // Check signature age
    const signedAt = new Date(signatureInfo.signedAt);
    const ageInDays = (Date.now() - signedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays > 365) {
      warnings.push('Signature is over 1 year old - consider updating to a newer version');
    }

    return {
      valid: true,
      keyId: key.keyId,
      signedAt: signatureInfo.signedAt,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      keyId: key.keyId,
      error: `Signature verification failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Create a signature (for testing/development only)
 * In production, signing should happen in a secure HSM/KMS
 */
export function createTestSignature(
  content: unknown,
  privateKeyPem: string,
  keyId: string,
  algorithm: 'RS256' | 'ES256' = 'RS256'
): SignatureInfo {
  const contentHash = computeContentHash(content);

  const signer = crypto.createSign(algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
  signer.update(contentHash);
  signer.end();

  const signature = signer.sign(privateKeyPem, 'base64');

  return {
    signature,
    keyId,
    algorithm,
    signedAt: new Date().toISOString(),
    contentHash,
  };
}

// ============================================
// Version Pinning
// ============================================

/**
 * Parse a version range constraint
 */
export function parseVersionConstraint(
  constraint: string
): { min?: string; max?: string; exact?: string } {
  // Exact version: "1.2.3"
  if (/^\d+\.\d+\.\d+$/.test(constraint)) {
    return { exact: constraint };
  }

  // Range: ">=1.0.0 <2.0.0" or "^1.0.0" or "~1.2.0"
  if (constraint.startsWith('^')) {
    // ^1.2.3 means >=1.2.3 <2.0.0
    const [major] = constraint.slice(1).split('.');
    return {
      min: constraint.slice(1),
      max: `${parseInt(major) + 1}.0.0`,
    };
  }

  if (constraint.startsWith('~')) {
    // ~1.2.3 means >=1.2.3 <1.3.0
    const [major, minor] = constraint.slice(1).split('.');
    return {
      min: constraint.slice(1),
      max: `${major}.${parseInt(minor) + 1}.0`,
    };
  }

  // Explicit range
  const parts = constraint.split(' ');
  let min: string | undefined;
  let max: string | undefined;

  for (const part of parts) {
    if (part.startsWith('>=')) {
      min = part.slice(2);
    } else if (part.startsWith('>')) {
      min = incrementVersion(part.slice(1));
    } else if (part.startsWith('<=')) {
      max = incrementVersion(part.slice(2));
    } else if (part.startsWith('<')) {
      max = part.slice(1);
    }
  }

  return { min, max };
}

/**
 * Check if a version satisfies a constraint
 */
export function satisfiesVersionConstraint(
  version: string,
  constraint: string
): boolean {
  const { min, max, exact } = parseVersionConstraint(constraint);

  if (exact) {
    return version === exact;
  }

  const vParts = version.split('.').map(Number);

  if (min) {
    const minParts = min.split('.').map(Number);
    if (compareVersions(vParts, minParts) < 0) {
      return false;
    }
  }

  if (max) {
    const maxParts = max.split('.').map(Number);
    if (compareVersions(vParts, maxParts) >= 0) {
      return false;
    }
  }

  return true;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2]++;
  return parts.join('.');
}

// ============================================
// Audit Helpers
// ============================================

export interface PolicyAuditEvent {
  eventType:
    | 'pack_installed'
    | 'pack_updated'
    | 'pack_uninstalled'
    | 'version_pinned'
    | 'config_changed'
    | 'signature_verified'
    | 'signature_failed';
  packId: string;
  packName: string;
  version?: string;
  organizationId: string;
  userId?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * Create an audit event for policy changes
 */
export function createPolicyAuditEvent(
  eventType: PolicyAuditEvent['eventType'],
  packId: string,
  packName: string,
  organizationId: string,
  details: Record<string, unknown>,
  options?: {
    version?: string;
    userId?: string;
  }
): PolicyAuditEvent {
  return {
    eventType,
    packId,
    packName,
    version: options?.version,
    organizationId,
    userId: options?.userId,
    details,
    timestamp: new Date().toISOString(),
  };
}
