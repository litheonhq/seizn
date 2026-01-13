/**
 * PCR Signature Module
 *
 * Cryptographic signature generation and verification for proof chains.
 */

import { createHmac, randomUUID, createHash } from 'crypto';
import type {
  ProofChainRecord,
  ProofSignature,
  VerificationResult,
  HashAlgorithm,
  SignatureAlgorithm,
  ChainLink,
} from './types';

// ============================================
// Configuration
// ============================================

const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';
const DEFAULT_SIGNATURE_ALGORITHM: SignatureAlgorithm = 'hmac';
const DEFAULT_VALIDITY_SECONDS = 365 * 24 * 60 * 60; // 1 year

/**
 * Get signing key from environment
 */
function getSigningKey(): string {
  const key = process.env.PCR_SIGNING_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error('PCR_SIGNING_KEY or NEXTAUTH_SECRET not configured');
  }
  return key;
}

// ============================================
// Hash Functions
// ============================================

/**
 * Generate hash of data
 */
export function generateHash(
  data: string | Buffer,
  algorithm: HashAlgorithm = DEFAULT_HASH_ALGORITHM
): string {
  const hash = createHash(algorithm);
  hash.update(typeof data === 'string' ? data : data);
  return hash.digest('hex');
}

/**
 * Generate hash of object (JSON serialized)
 */
export function hashObject(
  obj: Record<string, unknown>,
  algorithm: HashAlgorithm = DEFAULT_HASH_ALGORITHM
): string {
  // Sort keys for deterministic hashing
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return generateHash(sortedJson, algorithm);
}

/**
 * Generate content hash for evidence
 */
export function hashEvidence(
  content: string | Record<string, unknown>,
  algorithm: HashAlgorithm = DEFAULT_HASH_ALGORITHM
): string {
  if (typeof content === 'string') {
    return generateHash(content, algorithm);
  }
  return hashObject(content, algorithm);
}

// ============================================
// Chain Link Functions
// ============================================

/**
 * Generate hash for a chain link
 */
export function generateLinkHash(
  evidence: { id: string; type: string; hash: string; timestamp: string },
  previousHash: string | null,
  algorithm: HashAlgorithm = DEFAULT_HASH_ALGORITHM
): string {
  const linkData = {
    evidenceId: evidence.id,
    evidenceType: evidence.type,
    evidenceHash: evidence.hash,
    timestamp: evidence.timestamp,
    previousHash: previousHash || 'genesis',
  };
  return hashObject(linkData, algorithm);
}

/**
 * Verify chain integrity
 */
export function verifyChainIntegrity(
  chain: ChainLink[],
  algorithm: HashAlgorithm = DEFAULT_HASH_ALGORITHM
): { valid: boolean; brokenLinks: number[]; message: string } {
  if (chain.length === 0) {
    return { valid: true, brokenLinks: [], message: 'Empty chain is valid' };
  }

  const brokenLinks: number[] = [];

  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];

    // Check link index
    if (link.index !== i) {
      brokenLinks.push(i);
      continue;
    }

    // Check previous hash reference
    if (i === 0) {
      if (link.previousHash !== null) {
        brokenLinks.push(i);
        continue;
      }
    } else {
      if (link.previousHash !== chain[i - 1].linkHash) {
        brokenLinks.push(i);
        continue;
      }
    }

    // Verify link hash
    const expectedHash = generateLinkHash(
      link.evidence,
      link.previousHash,
      algorithm
    );
    if (link.linkHash !== expectedHash) {
      brokenLinks.push(i);
    }
  }

  return {
    valid: brokenLinks.length === 0,
    brokenLinks,
    message: brokenLinks.length === 0
      ? 'Chain integrity verified'
      : `Chain broken at links: ${brokenLinks.join(', ')}`,
  };
}

// ============================================
// Signature Functions
// ============================================

/**
 * Sign a proof chain
 */
export function signProofChain(
  proofChain: ProofChainRecord,
  options: {
    signerId: string;
    keyId?: string;
    algorithm?: SignatureAlgorithm;
    validitySeconds?: number;
    claims?: Record<string, unknown>;
  }
): ProofSignature {
  const {
    signerId,
    keyId = 'default',
    algorithm = DEFAULT_SIGNATURE_ALGORITHM,
    validitySeconds = DEFAULT_VALIDITY_SECONDS,
    claims,
  } = options;

  const signingKey = getSigningKey();
  const hashAlgorithm = proofChain.hashAlgorithm;

  // Create data to sign (hash of proof chain)
  const dataToSign = {
    proofChainId: proofChain.id,
    rootHash: proofChain.rootHash,
    finalHash: proofChain.finalHash,
    chainLength: proofChain.chain.length,
    version: proofChain.version,
  };
  const signedHash = hashObject(dataToSign, hashAlgorithm);

  // Generate signature
  let signature: string;
  if (algorithm === 'hmac') {
    const hmac = createHmac(hashAlgorithm, signingKey);
    hmac.update(signedHash);
    signature = hmac.digest('base64');
  } else {
    // For other algorithms, fall back to HMAC for now
    // In production, implement RSA/Ed25519 with proper key management
    const hmac = createHmac(hashAlgorithm, signingKey);
    hmac.update(signedHash);
    signature = hmac.digest('base64');
  }

  const now = new Date();
  const validUntil = new Date(now.getTime() + validitySeconds * 1000);

  return {
    id: randomUUID(),
    proofChainId: proofChain.id,
    algorithm,
    hashAlgorithm,
    signedHash,
    signature,
    keyId,
    signerId,
    signedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    claims,
  };
}

/**
 * Verify a signature
 */
export function verifySignature(
  proofChain: ProofChainRecord,
  signature: ProofSignature
): VerificationResult {
  const verifiedAt = new Date().toISOString();

  // Check chain integrity first
  const chainIntegrity = verifyChainIntegrity(proofChain.chain, proofChain.hashAlgorithm);

  // Check proof chain ID match
  if (signature.proofChainId !== proofChain.id) {
    return {
      valid: false,
      status: 'invalid',
      proofChainId: proofChain.id,
      signatureId: signature.id,
      verifiedAt,
      error: 'Signature proof chain ID does not match',
      chainIntegrity,
    };
  }

  // Check expiration
  if (signature.validUntil) {
    const expiresAt = new Date(signature.validUntil);
    if (expiresAt < new Date()) {
      return {
        valid: false,
        status: 'expired',
        proofChainId: proofChain.id,
        signatureId: signature.id,
        verifiedAt,
        error: 'Signature has expired',
        chainIntegrity,
      };
    }
  }

  // Verify the signature
  try {
    const signingKey = getSigningKey();

    // Recreate signed hash
    const dataToSign = {
      proofChainId: proofChain.id,
      rootHash: proofChain.rootHash,
      finalHash: proofChain.finalHash,
      chainLength: proofChain.chain.length,
      version: proofChain.version,
    };
    const expectedSignedHash = hashObject(dataToSign, signature.hashAlgorithm);

    if (expectedSignedHash !== signature.signedHash) {
      return {
        valid: false,
        status: 'invalid',
        proofChainId: proofChain.id,
        signatureId: signature.id,
        verifiedAt,
        error: 'Signed hash does not match proof chain',
        chainIntegrity,
      };
    }

    // Verify signature value
    if (signature.algorithm === 'hmac') {
      const hmac = createHmac(signature.hashAlgorithm, signingKey);
      hmac.update(signature.signedHash);
      const expectedSignature = hmac.digest('base64');

      if (expectedSignature !== signature.signature) {
        return {
          valid: false,
          status: 'invalid',
          proofChainId: proofChain.id,
          signatureId: signature.id,
          verifiedAt,
          error: 'Signature verification failed',
          chainIntegrity,
        };
      }
    }

    return {
      valid: chainIntegrity.valid,
      status: chainIntegrity.valid ? 'valid' : 'invalid',
      proofChainId: proofChain.id,
      signatureId: signature.id,
      verifiedAt,
      error: chainIntegrity.valid ? undefined : chainIntegrity.message,
      chainIntegrity,
    };
  } catch (error) {
    return {
      valid: false,
      status: 'key_not_found',
      proofChainId: proofChain.id,
      signatureId: signature.id,
      verifiedAt,
      error: error instanceof Error ? error.message : 'Verification failed',
      chainIntegrity,
    };
  }
}

/**
 * Generate a verification certificate
 */
export function generateVerificationCertificate(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  verificationResult: VerificationResult
): string {
  const cert = {
    title: 'Proof Chain Verification Certificate',
    issuedAt: new Date().toISOString(),
    proofChain: {
      id: proofChain.id,
      rootHash: proofChain.rootHash,
      finalHash: proofChain.finalHash,
      chainLength: proofChain.chain.length,
      createdAt: proofChain.createdAt,
    },
    signature: {
      id: signature.id,
      algorithm: `${signature.algorithm}-${signature.hashAlgorithm}`,
      signedAt: signature.signedAt,
      validUntil: signature.validUntil,
      signerId: signature.signerId,
    },
    verification: {
      status: verificationResult.status,
      valid: verificationResult.valid,
      verifiedAt: verificationResult.verifiedAt,
      chainIntegrity: verificationResult.chainIntegrity.message,
    },
  };

  return JSON.stringify(cert, null, 2);
}
