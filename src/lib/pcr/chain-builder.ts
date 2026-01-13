/**
 * PCR Chain Builder
 *
 * Builds proof chain records from RAG pipeline data.
 */

import { randomUUID } from 'crypto';
import type {
  ProofChainRecord,
  ChainLink,
  Evidence,
  EvidenceType,
  HashAlgorithm,
  CreateProofChainRequest,
} from './types';
import { generateHash, hashEvidence, generateLinkHash } from './signature';

// ============================================
// Configuration
// ============================================

const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';
const PCR_VERSION = '1.0' as const;

// ============================================
// Chain Builder Class
// ============================================

export class ProofChainBuilder {
  private chain: ChainLink[] = [];
  private hashAlgorithm: HashAlgorithm;
  private userId: string;
  private traceId?: string;

  constructor(options: {
    userId: string;
    hashAlgorithm?: HashAlgorithm;
    traceId?: string;
  }) {
    this.userId = options.userId;
    this.hashAlgorithm = options.hashAlgorithm || DEFAULT_HASH_ALGORITHM;
    this.traceId = options.traceId;
  }

  /**
   * Add evidence to the chain
   */
  addEvidence(
    type: EvidenceType,
    content: string | Record<string, unknown>,
    options?: {
      source?: Evidence['source'];
      metadata?: Record<string, unknown>;
    }
  ): this {
    const timestamp = new Date().toISOString();

    const evidence: Evidence = {
      id: randomUUID(),
      type,
      content,
      hash: hashEvidence(content, this.hashAlgorithm),
      timestamp,
      source: options?.source,
      metadata: options?.metadata,
    };

    const previousHash = this.chain.length > 0
      ? this.chain[this.chain.length - 1].linkHash
      : null;

    const linkHash = generateLinkHash(evidence, previousHash, this.hashAlgorithm);

    const link: ChainLink = {
      index: this.chain.length,
      evidence,
      linkHash,
      previousHash,
      timestamp,
    };

    this.chain.push(link);
    return this;
  }

  /**
   * Add query evidence
   */
  addQuery(query: string, metadata?: Record<string, unknown>): this {
    return this.addEvidence('query', query, { metadata });
  }

  /**
   * Add context chunk evidence
   */
  addContext(
    text: string,
    options?: {
      chunkId?: string;
      documentId?: string;
      documentTitle?: string;
      pageNumber?: number;
      score?: number;
    }
  ): this {
    return this.addEvidence(
      'context',
      { text, ...options },
      {
        source: {
          chunkId: options?.chunkId,
          documentId: options?.documentId,
          pageNumber: options?.pageNumber,
        },
        metadata: options?.score !== undefined ? { score: options.score } : undefined,
      }
    );
  }

  /**
   * Add answer evidence
   */
  addAnswer(answer: string, metadata?: Record<string, unknown>): this {
    return this.addEvidence('answer', answer, { metadata });
  }

  /**
   * Add contract verification evidence
   */
  addContract(contractResult: Record<string, unknown>): this {
    return this.addEvidence('contract', contractResult);
  }

  /**
   * Add metadata evidence
   */
  addMetadata(metadata: Record<string, unknown>): this {
    return this.addEvidence('metadata', metadata);
  }

  /**
   * Build the proof chain record
   */
  build(): ProofChainRecord {
    if (this.chain.length === 0) {
      throw new Error('Cannot build empty proof chain');
    }

    const now = new Date().toISOString();
    const rootHash = this.chain[0].linkHash;
    const finalHash = this.chain[this.chain.length - 1].linkHash;

    return {
      id: randomUUID(),
      userId: this.userId,
      traceId: this.traceId,
      version: PCR_VERSION,
      hashAlgorithm: this.hashAlgorithm,
      chain: this.chain,
      rootHash,
      finalHash,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get current chain length
   */
  get length(): number {
    return this.chain.length;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.chain = [];
    return this;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a proof chain from RAG pipeline request
 */
export function createProofChainFromRequest(
  request: CreateProofChainRequest,
  userId: string
): ProofChainRecord {
  const builder = new ProofChainBuilder({
    userId,
    traceId: request.traceId,
  });

  // Add query
  builder.addQuery(request.query);

  // Add context chunks
  if (request.contextChunks?.length) {
    for (const chunk of request.contextChunks) {
      builder.addContext(chunk.text, {
        chunkId: chunk.chunkId,
        ...(chunk.source as Record<string, unknown> || {}),
      });
    }
  }

  // Add answer
  if (request.answer) {
    builder.addAnswer(request.answer);
  }

  // Add contract result
  if (request.contractResult) {
    builder.addContract(request.contractResult);
  }

  // Add processing metadata
  if (request.metadata) {
    builder.addMetadata(request.metadata);
  }

  return builder.build();
}

/**
 * Create a minimal proof chain (query + answer only)
 */
export function createMinimalProofChain(
  query: string,
  answer: string,
  userId: string,
  traceId?: string
): ProofChainRecord {
  return new ProofChainBuilder({ userId, traceId })
    .addQuery(query)
    .addAnswer(answer)
    .build();
}

/**
 * Append to existing proof chain (creates new chain with additional evidence)
 */
export function appendToProofChain(
  existing: ProofChainRecord,
  newEvidence: Array<{
    type: EvidenceType;
    content: string | Record<string, unknown>;
    source?: Evidence['source'];
    metadata?: Record<string, unknown>;
  }>
): ProofChainRecord {
  const builder = new ProofChainBuilder({
    userId: existing.userId,
    hashAlgorithm: existing.hashAlgorithm,
    traceId: existing.traceId,
  });

  // Rebuild existing chain
  for (const link of existing.chain) {
    builder.addEvidence(
      link.evidence.type,
      link.evidence.content,
      {
        source: link.evidence.source,
        metadata: link.evidence.metadata,
      }
    );
  }

  // Add new evidence
  for (const evidence of newEvidence) {
    builder.addEvidence(evidence.type, evidence.content, {
      source: evidence.source,
      metadata: evidence.metadata,
    });
  }

  const newChain = builder.build();

  // Preserve original ID and creation time
  return {
    ...newChain,
    id: existing.id,
    createdAt: existing.createdAt,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract summary from proof chain
 */
export function extractProofChainSummary(proofChain: ProofChainRecord): {
  query: string | null;
  answer: string | null;
  contextCount: number;
  hasContract: boolean;
  chainLength: number;
  createdAt: string;
} {
  let query: string | null = null;
  let answer: string | null = null;
  let contextCount = 0;
  let hasContract = false;

  for (const link of proofChain.chain) {
    switch (link.evidence.type) {
      case 'query':
        query = typeof link.evidence.content === 'string'
          ? link.evidence.content
          : null;
        break;
      case 'answer':
        answer = typeof link.evidence.content === 'string'
          ? link.evidence.content
          : null;
        break;
      case 'context':
        contextCount++;
        break;
      case 'contract':
        hasContract = true;
        break;
    }
  }

  return {
    query,
    answer,
    contextCount,
    hasContract,
    chainLength: proofChain.chain.length,
    createdAt: proofChain.createdAt,
  };
}

/**
 * Get evidence by type from proof chain
 */
export function getEvidenceByType(
  proofChain: ProofChainRecord,
  type: EvidenceType
): Evidence[] {
  return proofChain.chain
    .filter((link) => link.evidence.type === type)
    .map((link) => link.evidence);
}
