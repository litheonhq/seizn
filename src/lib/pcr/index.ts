/**
 * PCR (Proof Chain Record) Library
 *
 * Cryptographic proof generation, signing, and evidence pack export
 * for RAG pipeline provenance tracking.
 *
 * @example
 * ```typescript
 * import {
 *   ProofChainBuilder,
 *   signProofChain,
 *   exportEvidencePack,
 * } from '@/lib/pcr';
 *
 * // Build proof chain
 * const builder = new ProofChainBuilder({ userId });
 * builder
 *   .addQuery('What is X?')
 *   .addContext('X is...', { chunkId: '123' })
 *   .addAnswer('Based on the context, X is...');
 *
 * const proofChain = builder.build();
 *
 * // Sign the proof chain
 * const signature = signProofChain(proofChain, {
 *   signerId: userId,
 * });
 *
 * // Export as evidence pack
 * const { content, filename } = await exportEvidencePack(
 *   proofChain,
 *   signature,
 *   { format: 'zip' }
 * );
 * ```
 */

// Types
export type {
  HashAlgorithm,
  SignatureAlgorithm,
  ProofStatus,
  EvidenceType,
  Evidence,
  ChainLink,
  ProofChainRecord,
  ProofSignature,
  VerificationResult,
  ExportFormat,
  EvidencePack,
  PackFile,
  ExportOptions,
  CreateProofChainRequest,
  CreateProofChainResponse,
  SignProofChainRequest,
  SignProofChainResponse,
  ExportEvidencePackRequest,
  ExportEvidencePackResponse,
  VerifyProofChainRequest,
  VerifyProofChainResponse,
  ProofChainRow,
  SignatureRow,
} from './types';

// Signature functions
export {
  generateHash,
  hashObject,
  hashEvidence,
  generateLinkHash,
  verifyChainIntegrity,
  signProofChain,
  verifySignature,
  generateVerificationCertificate,
} from './signature';

// Chain builder
export {
  ProofChainBuilder,
  createProofChainFromRequest,
  createMinimalProofChain,
  appendToProofChain,
  extractProofChainSummary,
  getEvidenceByType,
} from './chain-builder';

// Exporter
export {
  exportAsJson,
  exportAsZip,
  exportEvidencePack,
  importEvidencePackFromJson,
} from './exporter';
