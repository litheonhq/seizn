/**
 * Confidential RAG Mode
 *
 * Secure RAG with encryption and access controls:
 * - Chunk-level encryption
 * - Security classification
 * - Access control enforcement
 * - Audit logging for sensitive access
 *
 * @module confidential/rag-mode
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, type CipherGCM, type DecipherGCM } from 'crypto';
import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';

export type AccessReason =
  | 'query'
  | 'retrieval'
  | 'admin'
  | 'audit'
  | 'export'
  | 'deletion';

export interface SecurityClassification {
  level: SecurityLevel;
  categories?: string[];
  compartments?: string[];
  releaseableTo?: string[];
  handlingInstructions?: string[];
  declassifyOn?: string;
}

export interface SecureChunk {
  id: string;
  collectionId: string;
  classification: SecurityClassification;
  encryptedContent: string;
  contentHash: string;
  keyId: string;
  iv: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AccessPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  rules: AccessRule[];
  isActive: boolean;
  createdAt: string;
}

export interface AccessRule {
  securityLevel: SecurityLevel;
  allowedRoles: string[];
  requiresMfa?: boolean;
  requiresApproval?: boolean;
  maxResultsPerQuery?: number;
  auditLevel?: 'none' | 'basic' | 'detailed' | 'full';
  timeRestrictions?: {
    allowedDays?: number[];
    allowedHours?: { start: number; end: number };
  };
}

export interface AccessContext {
  userId: string;
  organizationId: string;
  roles: string[];
  clearanceLevel: SecurityLevel;
  compartments?: string[];
  mfaVerified?: boolean;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  redactedFields?: string[];
  auditRequired: boolean;
  approvalRequired?: boolean;
}

export interface SecureRetrievalResult {
  chunks: Array<{
    id: string;
    content: string;
    classification: SecurityClassification;
    accessDecision: AccessDecision;
  }>;
  accessLog: {
    id: string;
    timestamp: string;
    chunksAccessed: number;
    chunksRedacted: number;
    chunksDenied: number;
  };
}

// ============================================
// Encryption Service
// ============================================

export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyCache: Map<string, Buffer> = new Map();

  /**
   * Generate a new encryption key
   */
  generateKey(): { keyId: string; key: Buffer } {
    const keyId = crypto.randomUUID();
    const key = randomBytes(32);
    this.keyCache.set(keyId, key);
    return { keyId, key };
  }

  /**
   * Encrypt content
   */
  encrypt(content: string, key: Buffer): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv) as CipherGCM;

    let encrypted = cipher.update(content, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag().toString('base64');

    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag,
    };
  }

  /**
   * Decrypt content
   */
  decrypt(encrypted: string, key: Buffer, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(iv, 'base64')
    ) as DecipherGCM;
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Compute content hash for integrity verification
   */
  computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Store encryption key securely (in production, use KMS)
   */
  async storeKey(keyId: string, key: Buffer, organizationId: string): Promise<void> {
    const supabase = createServerClient();

    // In production, encrypt the key with a master key before storing
    const encryptedKey = key.toString('base64');

    await supabase.from('encryption_keys').insert({
      id: keyId,
      organization_id: organizationId,
      encrypted_key: encryptedKey,
      algorithm: this.algorithm,
      created_at: new Date().toISOString(),
    });

    this.keyCache.set(keyId, key);
  }

  /**
   * Retrieve encryption key
   */
  async getKey(keyId: string): Promise<Buffer | null> {
    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    const supabase = createServerClient();
    const { data } = await supabase
      .from('encryption_keys')
      .select('encrypted_key')
      .eq('id', keyId)
      .single();

    if (!data) return null;

    // In production, decrypt with master key
    const key = Buffer.from(data.encrypted_key, 'base64');
    this.keyCache.set(keyId, key);

    return key;
  }
}

// ============================================
// Access Control Service
// ============================================

export class AccessControlService {
  private supabase = createServerClient();

  private readonly levelHierarchy: Record<SecurityLevel, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
    top_secret: 4,
  };

  /**
   * Check if user can access content with given classification
   */
  checkAccess(
    context: AccessContext,
    classification: SecurityClassification,
    policy?: AccessPolicy
  ): AccessDecision {
    // Check security level clearance
    const userLevel = this.levelHierarchy[context.clearanceLevel];
    const contentLevel = this.levelHierarchy[classification.level];

    if (userLevel < contentLevel) {
      return {
        allowed: false,
        reason: `Insufficient clearance: requires ${classification.level}, user has ${context.clearanceLevel}`,
        auditRequired: true,
      };
    }

    // Check compartments if specified
    if (classification.compartments && classification.compartments.length > 0) {
      const hasAllCompartments = classification.compartments.every(
        (c) => context.compartments?.includes(c)
      );
      if (!hasAllCompartments) {
        return {
          allowed: false,
          reason: 'Missing required compartment access',
          auditRequired: true,
        };
      }
    }

    // Check releasable restrictions
    if (
      classification.releaseableTo &&
      classification.releaseableTo.length > 0 &&
      !classification.releaseableTo.includes(context.organizationId)
    ) {
      return {
        allowed: false,
        reason: 'Content not releasable to your organization',
        auditRequired: true,
      };
    }

    // Apply policy rules if provided
    if (policy) {
      const applicableRule = policy.rules.find(
        (r) => r.securityLevel === classification.level
      );

      if (applicableRule) {
        // Check role requirements
        if (
          applicableRule.allowedRoles.length > 0 &&
          !applicableRule.allowedRoles.some((r) => context.roles.includes(r))
        ) {
          return {
            allowed: false,
            reason: 'Your role does not have access to this content',
            auditRequired: true,
          };
        }

        // Check MFA requirement
        if (applicableRule.requiresMfa && !context.mfaVerified) {
          return {
            allowed: false,
            reason: 'MFA verification required',
            auditRequired: true,
          };
        }

        // Check time restrictions
        if (applicableRule.timeRestrictions) {
          const now = new Date();
          const day = now.getDay();
          const hour = now.getHours();

          if (
            applicableRule.timeRestrictions.allowedDays &&
            !applicableRule.timeRestrictions.allowedDays.includes(day)
          ) {
            return {
              allowed: false,
              reason: 'Access not allowed on this day',
              auditRequired: true,
            };
          }

          if (applicableRule.timeRestrictions.allowedHours) {
            const { start, end } = applicableRule.timeRestrictions.allowedHours;
            if (hour < start || hour >= end) {
              return {
                allowed: false,
                reason: `Access only allowed between ${start}:00 and ${end}:00`,
                auditRequired: true,
              };
            }
          }
        }

        // Check if approval required
        if (applicableRule.requiresApproval) {
          return {
            allowed: false,
            reason: 'Access requires approval',
            auditRequired: true,
            approvalRequired: true,
          };
        }
      }
    }

    // Determine audit level based on security level
    const auditRequired = contentLevel >= this.levelHierarchy.confidential;

    return {
      allowed: true,
      reason: 'Access granted',
      auditRequired,
    };
  }

  /**
   * Log access attempt
   */
  async logAccess(params: {
    userId: string;
    organizationId: string;
    chunkId: string;
    classification: SecurityClassification;
    decision: AccessDecision;
    reason: AccessReason;
    context: Partial<AccessContext>;
  }): Promise<string> {
    const logId = crypto.randomUUID();

    await this.supabase.from('confidential_access_logs').insert({
      id: logId,
      user_id: params.userId,
      organization_id: params.organizationId,
      chunk_id: params.chunkId,
      security_level: params.classification.level,
      access_granted: params.decision.allowed,
      denial_reason: params.decision.allowed ? null : params.decision.reason,
      access_reason: params.reason,
      ip_address: params.context.ipAddress,
      user_agent: params.context.userAgent,
      session_id: params.context.sessionId,
      created_at: new Date().toISOString(),
    });

    return logId;
  }

  /**
   * Get user's effective clearance level
   */
  async getUserClearance(userId: string, organizationId: string): Promise<{
    level: SecurityLevel;
    compartments: string[];
    roles: string[];
  }> {
    const { data } = await this.supabase
      .from('user_security_clearances')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!data) {
      // Default to internal for organization members
      return {
        level: 'internal',
        compartments: [],
        roles: ['member'],
      };
    }

    return {
      level: data.clearance_level,
      compartments: data.compartments || [],
      roles: data.roles || ['member'],
    };
  }
}

// ============================================
// Confidential RAG Service
// ============================================

export class ConfidentialRAGService {
  private encryption: EncryptionService;
  private accessControl: AccessControlService;
  private supabase = createServerClient();

  constructor() {
    this.encryption = new EncryptionService();
    this.accessControl = new AccessControlService();
  }

  /**
   * Store chunk with encryption and classification
   */
  async storeSecureChunk(params: {
    collectionId: string;
    organizationId: string;
    content: string;
    classification: SecurityClassification;
    metadata?: Record<string, unknown>;
  }): Promise<SecureChunk> {
    // Generate or get encryption key
    const { keyId, key } = this.encryption.generateKey();
    await this.encryption.storeKey(keyId, key, params.organizationId);

    // Encrypt content
    const { encrypted, iv, authTag } = this.encryption.encrypt(params.content, key);
    const contentHash = this.encryption.computeHash(params.content);

    const now = new Date().toISOString();
    const chunkId = crypto.randomUUID();

    // Store encrypted chunk
    await this.supabase.from('secure_chunks').insert({
      id: chunkId,
      collection_id: params.collectionId,
      organization_id: params.organizationId,
      classification: params.classification,
      encrypted_content: encrypted,
      content_hash: contentHash,
      key_id: keyId,
      iv,
      auth_tag: authTag,
      metadata: params.metadata,
      created_at: now,
      updated_at: now,
    });

    return {
      id: chunkId,
      collectionId: params.collectionId,
      classification: params.classification,
      encryptedContent: encrypted,
      contentHash,
      keyId,
      iv,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieve chunks with access control
   */
  async retrieveSecure(params: {
    collectionId: string;
    context: AccessContext;
    chunkIds: string[];
    reason: AccessReason;
    policy?: AccessPolicy;
  }): Promise<SecureRetrievalResult> {
    const results: SecureRetrievalResult['chunks'] = [];
    const chunksRedacted = 0;
    let chunksDenied = 0;

    const logId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Get chunks
    const { data: chunks } = await this.supabase
      .from('secure_chunks')
      .select('*')
      .in('id', params.chunkIds)
      .eq('collection_id', params.collectionId);

    for (const chunk of chunks || []) {
      const classification = chunk.classification as SecurityClassification;

      // Check access
      const decision = this.accessControl.checkAccess(
        params.context,
        classification,
        params.policy
      );

      // Log access attempt
      if (decision.auditRequired) {
        await this.accessControl.logAccess({
          userId: params.context.userId,
          organizationId: params.context.organizationId,
          chunkId: chunk.id,
          classification,
          decision,
          reason: params.reason,
          context: params.context,
        });
      }

      if (decision.allowed) {
        // Decrypt content
        const key = await this.encryption.getKey(chunk.key_id);
        if (!key) {
          results.push({
            id: chunk.id,
            content: '[DECRYPTION KEY NOT FOUND]',
            classification,
            accessDecision: { ...decision, allowed: false, reason: 'Decryption key not found' },
          });
          chunksDenied++;
          continue;
        }

        const content = this.encryption.decrypt(
          chunk.encrypted_content,
          key,
          chunk.iv,
          chunk.auth_tag
        );

        // Verify integrity
        const hash = this.encryption.computeHash(content);
        if (hash !== chunk.content_hash) {
          results.push({
            id: chunk.id,
            content: '[INTEGRITY CHECK FAILED]',
            classification,
            accessDecision: { ...decision, allowed: false, reason: 'Content integrity check failed' },
          });
          chunksDenied++;
          continue;
        }

        results.push({
          id: chunk.id,
          content,
          classification,
          accessDecision: decision,
        });
      } else {
        // Return redacted result
        results.push({
          id: chunk.id,
          content: '[ACCESS DENIED]',
          classification,
          accessDecision: decision,
        });
        chunksDenied++;
      }
    }

    return {
      chunks: results,
      accessLog: {
        id: logId,
        timestamp,
        chunksAccessed: results.length - chunksDenied,
        chunksRedacted,
        chunksDenied,
      },
    };
  }

  /**
   * Classify content using LLM
   */
  async classifyContent(content: string): Promise<SecurityClassification> {
    // Simple heuristic classification (in production, use LLM or rules engine)
    const sensitivePatterns = [
      { pattern: /confidential|secret|private/i, level: 'confidential' as SecurityLevel },
      { pattern: /restricted|classified/i, level: 'restricted' as SecurityLevel },
      { pattern: /top secret|ts\/sci/i, level: 'top_secret' as SecurityLevel },
      { pattern: /internal use only/i, level: 'internal' as SecurityLevel },
    ];

    for (const { pattern, level } of sensitivePatterns) {
      if (pattern.test(content)) {
        return { level };
      }
    }

    // Check for PII indicators
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{6}-\d{7}\b/, // Korean RRN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(content)) {
        return {
          level: 'confidential',
          categories: ['PII'],
          handlingInstructions: ['Do not share externally', 'Encrypt at rest'],
        };
      }
    }

    return { level: 'internal' };
  }
}

// ============================================
// Factory functions
// ============================================

export function createEncryptionService(): EncryptionService {
  return new EncryptionService();
}

export function createAccessControlService(): AccessControlService {
  return new AccessControlService();
}

export function createConfidentialRAGService(): ConfidentialRAGService {
  return new ConfidentialRAGService();
}
