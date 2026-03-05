/**
 * Unified PII Detection Pipeline
 *
 * Combines regex-based detection with Presidio NER for comprehensive PII protection.
 * Supports multiple modes: fast (regex-only), standard (regex + Presidio), strict (all checks).
 *
 * Pipeline stages:
 * 1. Fast regex detection (local, instant)
 * 2. Presidio NER detection (optional, requires service)
 * 3. Context analysis for false positive reduction
 * 4. Policy-based action (mask/redact/encrypt/deny)
 * 5. Audit logging
 */

import {
  detectPII,
  type PIIMatch,
  type PIIDetectionResult,
  type DetectionOptions,
} from './pii-detector';
import { maskPIIWithMatches, type MaskOptions, type MaskResult } from './pii-masker';
import { type PIIType } from './pii-patterns';
import {
  PresidioClient,
  getPresidioClient,
  KOREAN_RECOGNIZERS,
  type PresidioRecognizerResult,
  type PresidioEntityType,
  type AnonymizeOperator,
} from './presidio-client';

// ============================================
// Types
// ============================================

/**
 * Pipeline detection mode
 */
export type PipelineMode = 'fast' | 'standard' | 'strict';

/**
 * Action to take on PII detection
 */
export type PIIAction = 'allow' | 'mask' | 'redact' | 'hash' | 'encrypt' | 'deny';

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Detection mode */
  mode: PipelineMode;
  /** Default action for detected PII */
  defaultAction: PIIAction;
  /** Per-type action overrides */
  typeActions?: Partial<Record<PIIType | PresidioEntityType, PIIAction>>;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Language for Presidio (default: 'en') */
  language?: string;
  /** Enable audit logging */
  enableAudit?: boolean;
  /** Context words to boost detection */
  contextWords?: string[];
  /** Entity types to detect (empty = all) */
  entities?: (PIIType | PresidioEntityType)[];
  /** Entity types to exclude */
  excludeEntities?: (PIIType | PresidioEntityType)[];
  /** Encryption key for encrypt action */
  encryptionKey?: string;
}

/**
 * Unified PII entity (combines regex and Presidio results)
 */
export interface PIIEntity {
  /** Entity type */
  type: string;
  /** Detected value */
  value: string;
  /** Start position in text */
  start: number;
  /** End position in text */
  end: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detection source */
  source: 'regex' | 'presidio' | 'both';
  /** Action applied */
  action?: PIIAction;
  /** Masked/transformed value */
  maskedValue?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pipeline result
 */
export interface PipelineResult {
  /** Whether any PII was detected */
  found: boolean;
  /** Total entity count */
  count: number;
  /** All detected entities */
  entities: PIIEntity[];
  /** Unique entity types found */
  types: string[];
  /** Original text */
  original: string;
  /** Processed text (after action) */
  processed: string;
  /** Whether text was modified */
  modified: boolean;
  /** Overall action taken */
  action: PIIAction;
  /** Processing time in ms */
  processingTime: number;
  /** Detection mode used */
  mode: PipelineMode;
  /** Any errors during processing */
  errors?: string[];
}

/**
 * Audit log entry
 */
export interface PIIAuditEntry {
  timestamp: string;
  mode: PipelineMode;
  inputLength: number;
  entitiesFound: number;
  types: string[];
  actions: Record<string, number>;
  processingTime: number;
  errors?: string[];
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: PipelineConfig = {
  mode: 'standard',
  defaultAction: 'mask',
  minConfidence: 0.7,
  language: 'en',
  enableAudit: true,
};

// ============================================
// Type Mapping
// ============================================

/**
 * Map Presidio entity types to PIIType
 */
const PRESIDIO_TO_PII_TYPE: Record<PresidioEntityType, PIIType | null> = {
  PERSON: null, // No direct mapping
  EMAIL_ADDRESS: 'email',
  PHONE_NUMBER: 'phone',
  DATE_TIME: null,
  NRP: null,
  LOCATION: null,
  MEDICAL_LICENSE: null,
  URL: null,
  US_SSN: 'ssn',
  US_PASSPORT: null,
  US_DRIVER_LICENSE: null,
  UK_NHS: null,
  AU_ABN: null,
  AU_ACN: null,
  AU_TFN: null,
  AU_MEDICARE: null,
  KR_RRN: 'rrn',
  KR_PASSPORT: null,
  KR_DRIVER_LICENSE: null,
  CREDIT_CARD: 'credit_card',
  IBAN_CODE: null,
  US_BANK_NUMBER: null,
  CRYPTO: null,
  IP_ADDRESS: 'ip_address',
  AWS_ACCESS_KEY: 'aws_access_key',
  AZURE_STORAGE_KEY: null,
  SG_NRIC_FIN: null,
};

// ============================================
// Pipeline Class
// ============================================

export class PIIPipeline {
  private config: PipelineConfig;
  private presidioClient: PresidioClient | null = null;
  private auditLog: PIIAuditEntry[] = [];

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process text through the PII pipeline
   */
  async process(text: string, overrides?: Partial<PipelineConfig>): Promise<PipelineResult> {
    const startTime = performance.now();
    const config = { ...this.config, ...overrides };
    const errors: string[] = [];

    // Collect entities from all sources
    const entities: PIIEntity[] = [];

    // Stage 1: Regex detection (always runs)
    const regexEntities = this.runRegexDetection(text, config);
    entities.push(...regexEntities);

    // Stage 2: Presidio detection (if enabled)
    if (config.mode !== 'fast') {
      try {
        const presidioEntities = await this.runPresidioDetection(text, config);

        // Merge with regex entities (avoid duplicates)
        for (const entity of presidioEntities) {
          const existing = entities.find(
            (e) => this.entitiesOverlap(e, entity)
          );

          if (existing) {
            // Merge: keep higher confidence
            if (entity.confidence > existing.confidence) {
              existing.confidence = entity.confidence;
            }
            existing.source = 'both';
          } else {
            entities.push(entity);
          }
        }
      } catch (error) {
        errors.push(`Presidio detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue with regex results only
      }
    }

    // Stage 3: Apply filters
    const filteredEntities = this.applyFilters(entities, config);

    // Stage 4: Apply actions
    const { processed, actionedEntities } = await this.applyActions(
      text,
      filteredEntities,
      config
    );

    // Stage 5: Audit logging
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    if (config.enableAudit) {
      this.logAudit(text, actionedEntities, processingTime, config.mode, errors);
    }

    // Determine overall action
    const overallAction = this.determineOverallAction(actionedEntities, config);

    return {
      found: actionedEntities.length > 0,
      count: actionedEntities.length,
      entities: actionedEntities,
      types: [...new Set(actionedEntities.map((e) => e.type))],
      original: text,
      processed: overallAction === 'deny' ? '' : processed,
      modified: processed !== text,
      action: overallAction,
      processingTime,
      mode: config.mode,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Quick check if text contains PII
   */
  async hasPII(text: string, config?: Partial<PipelineConfig>): Promise<boolean> {
    const result = await this.process(text, { ...config, enableAudit: false });
    return result.found;
  }

  /**
   * Get PII summary without full processing
   */
  quickScan(text: string): { found: boolean; types: PIIType[]; count: number } {
    const result = detectPII(text, { minConfidence: this.config.minConfidence });
    return {
      found: result.found,
      types: result.types,
      count: result.count,
    };
  }

  /**
   * Run regex-based detection
   */
  private runRegexDetection(text: string, config: PipelineConfig): PIIEntity[] {
    const options: DetectionOptions = {
      minConfidence: config.minConfidence,
      includeValues: true,
    };

    // Filter by entity types if specified
    if (config.entities && config.entities.length > 0) {
      const piiTypes = config.entities.filter((e) => !e.includes('_')) as PIIType[];
      if (piiTypes.length > 0) {
        options.includeTypes = piiTypes;
      }
    }

    if (config.excludeEntities && config.excludeEntities.length > 0) {
      const excludeTypes = config.excludeEntities.filter((e) => !e.includes('_')) as PIIType[];
      if (excludeTypes.length > 0) {
        options.excludeTypes = excludeTypes;
      }
    }

    const result = detectPII(text, options);

    return result.matches.map((match) => ({
      type: match.type,
      value: match.value,
      start: match.startIndex,
      end: match.endIndex,
      confidence: match.confidence,
      source: 'regex' as const,
      metadata: { description: match.description },
    }));
  }

  /**
   * Run Presidio NER detection
   */
  private async runPresidioDetection(
    text: string,
    config: PipelineConfig
  ): Promise<PIIEntity[]> {
    if (!this.presidioClient) {
      this.presidioClient = getPresidioClient();
    }

    // Check if Presidio is available
    try {
      const health = await this.presidioClient.healthCheck();
      if (!health.analyzer) {
        throw new Error('Presidio Analyzer not available');
      }
    } catch {
      // Presidio not available, return empty
      return [];
    }

    // Build entity list for Presidio
    let entities: PresidioEntityType[] | undefined;
    if (config.entities && config.entities.length > 0) {
      entities = config.entities.filter((e) =>
        Object.keys(PRESIDIO_TO_PII_TYPE).includes(e)
      ) as PresidioEntityType[];
    }

    // Add Korean recognizers if language is Korean
    const adHocRecognizers = config.language === 'ko' ? KOREAN_RECOGNIZERS : undefined;

    const results = await this.presidioClient.analyze({
      text,
      language: config.language,
      entities,
      score_threshold: config.minConfidence,
      return_decision_process: config.mode === 'strict',
      ad_hoc_recognizers: adHocRecognizers,
      context: config.contextWords,
    });

    return results.map((result) => ({
      type: result.entity_type,
      value: text.slice(result.start, result.end),
      start: result.start,
      end: result.end,
      confidence: result.score,
      source: 'presidio' as const,
      metadata: result.analysis_explanation
        ? {
            recognizer: result.analysis_explanation.recognizer,
            explanation: result.analysis_explanation.textual_explanation,
          }
        : undefined,
    }));
  }

  /**
   * Check if two entities overlap
   */
  private entitiesOverlap(a: PIIEntity, b: PIIEntity): boolean {
    return a.start < b.end && b.start < a.end;
  }

  /**
   * Apply filters to entities
   */
  private applyFilters(entities: PIIEntity[], config: PipelineConfig): PIIEntity[] {
    let filtered = entities;

    // Filter by confidence
    if (config.minConfidence) {
      filtered = filtered.filter((e) => e.confidence >= config.minConfidence!);
    }

    // Filter by excluded types
    if (config.excludeEntities && config.excludeEntities.length > 0) {
      filtered = filtered.filter((e) => !config.excludeEntities!.includes(e.type as PIIType));
    }

    // Sort by position
    filtered.sort((a, b) => a.start - b.start);

    // Remove duplicates/overlapping (keep highest confidence)
    const deduped: PIIEntity[] = [];
    for (const entity of filtered) {
      const overlapping = deduped.find((e) => this.entitiesOverlap(e, entity));
      if (!overlapping) {
        deduped.push(entity);
      } else if (entity.confidence > overlapping.confidence) {
        // Replace with higher confidence
        const idx = deduped.indexOf(overlapping);
        deduped[idx] = entity;
      }
    }

    return deduped;
  }

  /**
   * Apply actions to entities
   */
  private async applyActions(
    text: string,
    entities: PIIEntity[],
    config: PipelineConfig
  ): Promise<{ processed: string; actionedEntities: PIIEntity[] }> {
    if (entities.length === 0) {
      return { processed: text, actionedEntities: [] };
    }

    const actionedEntities: PIIEntity[] = [];
    let processed = text;

    // Sort by position descending to preserve indices
    const sorted = [...entities].sort((a, b) => b.start - a.start);

    for (const entity of sorted) {
      // Determine action for this entity type
      const action = config.typeActions?.[entity.type as PIIType] || config.defaultAction;
      entity.action = action;

      // Apply action
      switch (action) {
        case 'allow':
          // No modification
          entity.maskedValue = entity.value;
          break;

        case 'mask':
          entity.maskedValue = this.maskValue(entity);
          processed =
            processed.slice(0, entity.start) +
            entity.maskedValue +
            processed.slice(entity.end);
          break;

        case 'redact':
          entity.maskedValue = `[${entity.type.toUpperCase()}]`;
          processed =
            processed.slice(0, entity.start) +
            entity.maskedValue +
            processed.slice(entity.end);
          break;

        case 'hash':
          entity.maskedValue = await this.hashValue(entity.value);
          processed =
            processed.slice(0, entity.start) +
            entity.maskedValue +
            processed.slice(entity.end);
          break;

        case 'encrypt':
          if (config.encryptionKey) {
            entity.maskedValue = await this.encryptValue(entity.value, config.encryptionKey);
          } else {
            entity.maskedValue = `[ENCRYPTED:${entity.type}]`;
          }
          processed =
            processed.slice(0, entity.start) +
            entity.maskedValue +
            processed.slice(entity.end);
          break;

        case 'deny':
          // Will be handled at result level
          entity.maskedValue = '';
          break;
      }

      actionedEntities.unshift(entity); // Maintain original order
    }

    return { processed, actionedEntities };
  }

  /**
   * Mask a single value based on type
   */
  private maskValue(entity: PIIEntity): string {
    const { type, value } = entity;

    // Use type-specific masking
    switch (type) {
      case 'email':
      case 'EMAIL_ADDRESS':
        const atIdx = value.indexOf('@');
        if (atIdx > 0) {
          return `${value[0]}***@***${value.slice(value.lastIndexOf('.'))}`;
        }
        return '***@***.***';

      case 'phone':
      case 'phone_kr':
      case 'PHONE_NUMBER':
        return `***-****-${value.slice(-4)}`;

      case 'credit_card':
      case 'CREDIT_CARD':
        return `****-****-****-${value.slice(-4)}`;

      case 'ssn':
      case 'US_SSN':
        return `***-**-${value.slice(-4)}`;

      case 'rrn':
      case 'KR_RRN':
        return '******-*******';

      case 'ip_address':
      case 'IP_ADDRESS':
        return '***.***.***.***';

      case 'PERSON':
        return '[NAME]';

      case 'LOCATION':
        return '[LOCATION]';

      default:
        // Generic masking: show first and last 2 chars
        if (value.length <= 4) {
          return '*'.repeat(value.length);
        }
        return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`;
    }
  }

  /**
   * Hash a value
   */
  private async hashValue(value: string): Promise<string> {
    // Use SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `[HASH:${hashHex.slice(0, 8)}]`;
  }

  private toBase64Url(bytes: Uint8Array): string {
    if (typeof btoa !== 'function' && typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64url');
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  /**
   * Encrypt a value
   */
  private async encryptValue(value: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(key));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return `[ENCv1:${this.toBase64Url(combined)}]`;
  }

  /**
   * Determine overall action
   */
  private determineOverallAction(entities: PIIEntity[], config: PipelineConfig): PIIAction {
    if (entities.length === 0) {
      return 'allow';
    }

    // If any entity requires deny, deny all
    if (entities.some((e) => e.action === 'deny')) {
      return 'deny';
    }

    // Return the most restrictive action applied
    const actionPriority: PIIAction[] = ['encrypt', 'hash', 'redact', 'mask', 'allow'];
    for (const action of actionPriority) {
      if (entities.some((e) => e.action === action)) {
        return action;
      }
    }

    return config.defaultAction;
  }

  /**
   * Log audit entry
   */
  private logAudit(
    text: string,
    entities: PIIEntity[],
    processingTime: number,
    mode: PipelineMode,
    errors: string[]
  ): void {
    const actionCounts: Record<string, number> = {};
    for (const entity of entities) {
      const action = entity.action || 'unknown';
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    }

    const entry: PIIAuditEntry = {
      timestamp: new Date().toISOString(),
      mode,
      inputLength: text.length,
      entitiesFound: entities.length,
      types: [...new Set(entities.map((e) => e.type))],
      actions: actionCounts,
      processingTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Get audit log
   */
  getAuditLog(): PIIAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Get configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Default Pipeline Instance
// ============================================

let defaultPipeline: PIIPipeline | null = null;

/**
 * Get default PII pipeline
 */
export function getPIIPipeline(): PIIPipeline {
  if (!defaultPipeline) {
    defaultPipeline = new PIIPipeline();
  }
  return defaultPipeline;
}

/**
 * Configure default pipeline
 */
export function configurePIIPipeline(config: Partial<PipelineConfig>): void {
  defaultPipeline = new PIIPipeline(config);
}

/**
 * Quick process helper
 */
export async function processPII(
  text: string,
  config?: Partial<PipelineConfig>
): Promise<PipelineResult> {
  const pipeline = getPIIPipeline();
  return pipeline.process(text, config);
}

/**
 * Quick scan helper
 */
export function scanPII(text: string): { found: boolean; types: PIIType[]; count: number } {
  const pipeline = getPIIPipeline();
  return pipeline.quickScan(text);
}
