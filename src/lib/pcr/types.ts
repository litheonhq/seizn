/**
 * PCR (Proof Chain Record) Types
 *
 * Type definitions for cryptographic proof generation, verification,
 * and evidence pack export functionality.
 */

// ============================================
// Core Types
// ============================================

/**
 * Hash algorithm for signatures
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

/**
 * Signature algorithm
 */
export type SignatureAlgorithm = 'hmac' | 'rsa' | 'ed25519';

/**
 * Proof status
 */
export type ProofStatus = 'pending' | 'signed' | 'verified' | 'invalid' | 'expired';

/**
 * Evidence type in a proof chain
 */
export type EvidenceType =
  | 'query'           // User query
  | 'context'         // Retrieved context chunks
  | 'answer'          // Generated answer
  | 'contract'        // Answer contract verification
  | 'metadata';       // Processing metadata

// ============================================
// Evidence Types
// ============================================

/**
 * Single piece of evidence in a proof chain
 */
export interface Evidence {
  /** Unique identifier */
  id: string;
  /** Type of evidence */
  type: EvidenceType;
  /** Evidence content (will be hashed) */
  content: string | Record<string, unknown>;
  /** Content hash */
  hash: string;
  /** Timestamp */
  timestamp: string;
  /** Optional source reference */
  source?: {
    documentId?: string;
    chunkId?: string;
    pageNumber?: number;
    url?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Link in the proof chain
 */
export interface ChainLink {
  /** Link index (0-based) */
  index: number;
  /** Evidence at this link */
  evidence: Evidence;
  /** Hash of this link (includes previous hash) */
  linkHash: string;
  /** Hash of previous link (null for genesis) */
  previousHash: string | null;
  /** Timestamp */
  timestamp: string;
}

// ============================================
// Proof Chain Types
// ============================================

/**
 * Complete proof chain record
 */
export interface ProofChainRecord {
  /** Unique identifier */
  id: string;
  /** User who owns this record */
  userId: string;
  /** Optional trace ID for linking */
  traceId?: string;
  /** Chain version */
  version: '1.0';
  /** Hash algorithm used */
  hashAlgorithm: HashAlgorithm;
  /** All chain links */
  chain: ChainLink[];
  /** Root hash (hash of genesis) */
  rootHash: string;
  /** Final chain hash (hash of last link) */
  finalHash: string;
  /** Proof status */
  status: ProofStatus;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Optional expiration */
  expiresAt?: string;
}

// ============================================
// Signature Types
// ============================================

/**
 * Digital signature for a proof chain
 */
export interface ProofSignature {
  /** Signature ID */
  id: string;
  /** Proof chain ID */
  proofChainId: string;
  /** Signature algorithm */
  algorithm: SignatureAlgorithm;
  /** Hash algorithm */
  hashAlgorithm: HashAlgorithm;
  /** Signed data (hash of proof chain) */
  signedHash: string;
  /** Signature value (base64 encoded) */
  signature: string;
  /** Public key ID or reference */
  keyId: string;
  /** Signer identifier */
  signerId: string;
  /** Signing timestamp */
  signedAt: string;
  /** Signature validity period */
  validUntil?: string;
  /** Additional claims */
  claims?: Record<string, unknown>;
}

/**
 * Signature verification result
 */
export interface VerificationResult {
  /** Is the signature valid? */
  valid: boolean;
  /** Verification status */
  status: 'valid' | 'invalid' | 'expired' | 'key_not_found' | 'algorithm_mismatch';
  /** Verified proof chain ID */
  proofChainId: string;
  /** Signature ID */
  signatureId: string;
  /** Verification timestamp */
  verifiedAt: string;
  /** Error message if invalid */
  error?: string;
  /** Chain integrity check result */
  chainIntegrity: {
    valid: boolean;
    brokenLinks: number[];
    message: string;
  };
}

// ============================================
// Export Types
// ============================================

/**
 * Evidence pack export format
 */
export type ExportFormat = 'zip' | 'json' | 'pdf';

/**
 * Evidence pack contents
 */
export interface EvidencePack {
  /** Pack ID */
  id: string;
  /** Proof chain record */
  proofChain: ProofChainRecord;
  /** Signature */
  signature: ProofSignature;
  /** Export format */
  format: ExportFormat;
  /** Export timestamp */
  exportedAt: string;
  /** Pack checksum */
  checksum: string;
  /** Included files (for ZIP) */
  files?: PackFile[];
}

/**
 * File in evidence pack
 */
export interface PackFile {
  /** File name */
  name: string;
  /** File path within pack */
  path: string;
  /** File content type */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** File checksum */
  checksum: string;
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Include raw evidence content */
  includeRawContent?: boolean;
  /** Include human-readable summary */
  includeSummary?: boolean;
  /** Compression level (1-9, for ZIP) */
  compressionLevel?: number;
  /** Password protection (for ZIP) */
  password?: string;
  /** Custom filename prefix */
  filenamePrefix?: string;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Request to create a proof chain
 */
export interface CreateProofChainRequest {
  /** Query text */
  query: string;
  /** Retrieved context chunks */
  contextChunks?: Array<{
    chunkId: string;
    text: string;
    source?: Record<string, unknown>;
  }>;
  /** Generated answer */
  answer?: string;
  /** Answer contract result */
  contractResult?: Record<string, unknown>;
  /** Processing metadata */
  metadata?: Record<string, unknown>;
  /** Optional trace ID */
  traceId?: string;
}

/**
 * Response from creating a proof chain
 */
export interface CreateProofChainResponse {
  /** Created proof chain */
  proofChain: ProofChainRecord;
  /** Message */
  message: string;
}

/**
 * Request to sign a proof chain
 */
export interface SignProofChainRequest {
  /** Proof chain ID */
  proofChainId: string;
  /** Custom claims to include */
  claims?: Record<string, unknown>;
  /** Validity period in seconds */
  validityPeriod?: number;
}

/**
 * Response from signing
 */
export interface SignProofChainResponse {
  /** Created signature */
  signature: ProofSignature;
  /** Updated proof chain */
  proofChain: ProofChainRecord;
}

/**
 * Request to export evidence pack
 */
export interface ExportEvidencePackRequest {
  /** Proof chain ID */
  proofChainId: string;
  /** Export options */
  options?: ExportOptions;
}

/**
 * Response from export
 */
export interface ExportEvidencePackResponse {
  /** Evidence pack metadata */
  pack: EvidencePack;
  /** Download URL (temporary) */
  downloadUrl?: string;
  /** Base64 content (for small packs) */
  content?: string;
}

/**
 * Request to verify a proof chain
 */
export interface VerifyProofChainRequest {
  /** Proof chain ID or proof chain data */
  proofChain: string | ProofChainRecord;
  /** Signature to verify */
  signature?: string | ProofSignature;
}

/**
 * Response from verification
 */
export interface VerifyProofChainResponse {
  /** Verification result */
  result: VerificationResult;
}

// ============================================
// Database Row Types
// ============================================

/**
 * Proof chain database row
 */
export interface ProofChainRow {
  id: string;
  user_id: string;
  trace_id: string | null;
  version: string;
  hash_algorithm: HashAlgorithm;
  chain: ChainLink[];
  root_hash: string;
  final_hash: string;
  status: ProofStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

/**
 * Signature database row
 */
export interface SignatureRow {
  id: string;
  proof_chain_id: string;
  user_id: string;
  algorithm: SignatureAlgorithm;
  hash_algorithm: HashAlgorithm;
  signed_hash: string;
  signature: string;
  key_id: string;
  claims: Record<string, unknown> | null;
  signed_at: string;
  valid_until: string | null;
}
