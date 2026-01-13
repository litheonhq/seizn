/**
 * PII-Safe Logging for Flight Recorder
 *
 * Extends Winter PII detection to handle chunk text in traces,
 * with configurable masking patterns for different data types.
 */

import { detectPII, type PiiDetection, type PiiType } from '@/lib/winter/pii';

// ============================================
// Configurable PII Patterns
// ============================================

export interface PiiPatternConfig {
  /** Pattern name/identifier */
  name: string;
  /** Regular expression pattern */
  pattern: RegExp;
  /** PII type for categorization */
  type: PiiType | string;
  /** Masking function */
  mask: (match: string) => string;
  /** Whether this pattern is enabled */
  enabled: boolean;
}

export interface PiiMaskingConfig {
  /** Enable PII masking for query text */
  maskQueryText: boolean;
  /** Enable PII masking for chunk/document text */
  maskChunkText: boolean;
  /** Enable PII masking for event payloads */
  maskEventPayloads: boolean;
  /** Custom patterns to add beyond defaults */
  customPatterns: PiiPatternConfig[];
  /** PII types to exclude from masking */
  excludeTypes: (PiiType | string)[];
  /** Fields in payloads to skip masking */
  excludeFields: string[];
  /** Maximum text length to process (performance guard) */
  maxTextLength: number;
  /** Truncate masked text to this length (0 = no truncation) */
  truncateAfterMask: number;
}

export const DEFAULT_PII_MASKING_CONFIG: PiiMaskingConfig = {
  maskQueryText: true,
  maskChunkText: true,
  maskEventPayloads: true,
  customPatterns: [],
  excludeTypes: [],
  excludeFields: ['trace_id', 'request_id', 'chunk_id', 'document_id', 'collection_id'],
  maxTextLength: 100_000,
  truncateAfterMask: 0,
};

// ============================================
// Built-in Custom Pattern Definitions
// ============================================

/** AWS Access Key pattern */
const AWS_KEY_PATTERN: PiiPatternConfig = {
  name: 'aws_access_key',
  pattern: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
  type: 'api_key',
  mask: () => '[AWS_KEY_REDACTED]',
  enabled: true,
};

/** Generic API Key pattern (common formats) */
const API_KEY_PATTERN: PiiPatternConfig = {
  name: 'api_key',
  pattern: /\b(sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,}|api[_-]?key[_-]?[a-zA-Z0-9]{16,})\b/gi,
  type: 'api_key',
  mask: (match) => `[API_KEY:${match.slice(0, 4)}...]`,
  enabled: true,
};

/** JWT Token pattern */
const JWT_PATTERN: PiiPatternConfig = {
  name: 'jwt_token',
  pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  type: 'token',
  mask: () => '[JWT_REDACTED]',
  enabled: true,
};

/** Korean Name pattern (2-4 Korean characters) */
const KOREAN_NAME_PATTERN: PiiPatternConfig = {
  name: 'korean_name',
  pattern: /[가-힣]{2,4}(?=\s*님|\s*씨|\s*선생|\s*고객|\s*회원)/g,
  type: 'name',
  mask: (match) => match.charAt(0) + '*'.repeat(match.length - 1),
  enabled: false, // Disabled by default due to false positives
};

/** Passport Number (Korean format) */
const PASSPORT_PATTERN: PiiPatternConfig = {
  name: 'passport_kr',
  pattern: /\b[A-Z]{1,2}\d{7,8}\b/g,
  type: 'passport',
  mask: () => '[PASSPORT_REDACTED]',
  enabled: true,
};

/** Bank Account Number (Korean format) */
const BANK_ACCOUNT_PATTERN: PiiPatternConfig = {
  name: 'bank_account_kr',
  pattern: /\b\d{3,4}-\d{2,6}-\d{2,8}\b/g,
  type: 'bank_account',
  mask: (match) => {
    const parts = match.split('-');
    return `${parts[0]}-****-${parts[parts.length - 1]?.slice(-4) || '****'}`;
  },
  enabled: true,
};

/** URL with potential credentials */
const URL_CREDENTIALS_PATTERN: PiiPatternConfig = {
  name: 'url_credentials',
  pattern: /\b(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi,
  type: 'credential',
  mask: (match) => match.replace(/:([^@]+)@/, ':****@'),
  enabled: true,
};

export const BUILT_IN_PATTERNS: PiiPatternConfig[] = [
  AWS_KEY_PATTERN,
  API_KEY_PATTERN,
  JWT_PATTERN,
  KOREAN_NAME_PATTERN,
  PASSPORT_PATTERN,
  BANK_ACCOUNT_PATTERN,
  URL_CREDENTIALS_PATTERN,
];

// ============================================
// Extended PII Detection
// ============================================

export interface ExtendedPiiDetection extends PiiDetection {
  patternName?: string;
}

function collectCustomPattern(
  pattern: PiiPatternConfig,
  text: string
): ExtendedPiiDetection[] {
  if (!pattern.enabled) return [];

  const out: ExtendedPiiDetection[] = [];
  const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
  let m: RegExpExecArray | null = null;

  while ((m = regex.exec(text)) !== null) {
    out.push({
      type: pattern.type as PiiType,
      match: m[0],
      index: m.index,
      patternName: pattern.name,
    });
  }

  return out;
}

/**
 * Detect PII using both built-in patterns and custom patterns
 */
export function detectExtendedPII(
  text: string,
  config: Partial<PiiMaskingConfig> = {}
): ExtendedPiiDetection[] {
  const cfg = { ...DEFAULT_PII_MASKING_CONFIG, ...config };

  if (!text || text.length > cfg.maxTextLength) {
    return [];
  }

  // Get standard PII detections
  const standardDetections = detectPII(text).map((d) => ({
    ...d,
    patternName: undefined,
  }));

  // Get custom pattern detections
  const allPatterns = [...BUILT_IN_PATTERNS, ...cfg.customPatterns];
  const customDetections = allPatterns.flatMap((p) =>
    collectCustomPattern(p, text)
  );

  // Combine and filter by excluded types
  const allDetections = [...standardDetections, ...customDetections]
    .filter((d) => !cfg.excludeTypes.includes(d.type))
    .sort((a, b) => a.index - b.index);

  // Deduplicate overlapping detections (prefer earlier, longer matches)
  const deduped: ExtendedPiiDetection[] = [];
  for (const d of allDetections) {
    const overlaps = deduped.some(
      (existing) =>
        (d.index >= existing.index &&
          d.index < existing.index + existing.match.length) ||
        (existing.index >= d.index &&
          existing.index < d.index + d.match.length)
    );
    if (!overlaps) {
      deduped.push(d);
    }
  }

  return deduped;
}

// ============================================
// Extended PII Masking
// ============================================

function getMaskFunction(detection: ExtendedPiiDetection): (match: string) => string {
  // Check if it's a custom pattern
  if (detection.patternName) {
    const pattern = [...BUILT_IN_PATTERNS].find(
      (p) => p.name === detection.patternName
    );
    if (pattern) {
      return pattern.mask;
    }
  }

  // Default masks for standard types
  switch (detection.type) {
    case 'email':
      return (raw: string) => {
        const [local, domain] = raw.split('@');
        if (!domain) return '[EMAIL]';
        if (local.length <= 1) return `*@${domain}`;
        return `${local[0]}***@${domain}`;
      };
    case 'phone':
      return (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.length < 7) return '[PHONE]';
        const head = digits.slice(0, Math.min(3, digits.length));
        const tail = digits.slice(-4);
        return `${head}-****-${tail}`;
      };
    case 'rrn':
      return (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.length !== 13) return '[RRN]';
        return `${digits.slice(0, 6)}-*******`;
      };
    case 'credit_card':
      return (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.length < 13) return '[CARD]';
        return `****-****-****-${digits.slice(-4)}`;
      };
    case 'ip_address':
      return (raw: string) => {
        const parts = raw.split('.');
        if (parts.length !== 4) return '[IP]';
        return `${parts[0]}.${parts[1]}.***.***`;
      };
    default:
      return () => `[${String(detection.type).toUpperCase()}_REDACTED]`;
  }
}

export interface MaskExtendedPIIResult {
  maskedText: string;
  detections: ExtendedPiiDetection[];
  truncated: boolean;
}

/**
 * Mask PII in text using extended detection and configurable patterns
 */
export function maskExtendedPII(
  text: string,
  config: Partial<PiiMaskingConfig> = {}
): MaskExtendedPIIResult {
  const cfg = { ...DEFAULT_PII_MASKING_CONFIG, ...config };

  if (!text) {
    return { maskedText: '', detections: [], truncated: false };
  }

  // Guard against very long texts
  if (text.length > cfg.maxTextLength) {
    return {
      maskedText: text.slice(0, cfg.maxTextLength) + '... [TRUNCATED]',
      detections: [],
      truncated: true,
    };
  }

  const detections = detectExtendedPII(text, cfg);

  if (detections.length === 0) {
    let result = text;
    let truncated = false;

    if (cfg.truncateAfterMask > 0 && result.length > cfg.truncateAfterMask) {
      result = result.slice(0, cfg.truncateAfterMask) + '... [TRUNCATED]';
      truncated = true;
    }

    return { maskedText: result, detections, truncated };
  }

  // Replace from end to start to keep indices valid
  let masked = text;
  const sorted = [...detections].sort((a, b) => b.index - a.index);

  for (const d of sorted) {
    const maskFn = getMaskFunction(d);
    const replacement = maskFn(d.match);
    masked = masked.slice(0, d.index) + replacement + masked.slice(d.index + d.match.length);
  }

  let truncated = false;
  if (cfg.truncateAfterMask > 0 && masked.length > cfg.truncateAfterMask) {
    masked = masked.slice(0, cfg.truncateAfterMask) + '... [TRUNCATED]';
    truncated = true;
  }

  return { maskedText: masked, detections, truncated };
}

// ============================================
// Payload Masking for Traces
// ============================================

/**
 * Recursively mask PII in an object payload
 */
export function maskPayloadPII(
  payload: Record<string, unknown>,
  config: Partial<PiiMaskingConfig> = {}
): Record<string, unknown> {
  const cfg = { ...DEFAULT_PII_MASKING_CONFIG, ...config };

  if (!cfg.maskEventPayloads) {
    return payload;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // Skip excluded fields
    if (cfg.excludeFields.includes(key)) {
      result[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      const { maskedText } = maskExtendedPII(value, cfg);
      result[key] = maskedText;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          return maskExtendedPII(item, cfg).maskedText;
        }
        if (typeof item === 'object' && item !== null) {
          return maskPayloadPII(item as Record<string, unknown>, cfg);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = maskPayloadPII(value as Record<string, unknown>, cfg);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ============================================
// Chunk Text Masking
// ============================================

export interface ChunkMaskResult {
  text: string;
  piiDetected: boolean;
  detectionCount: number;
  truncated: boolean;
}

/**
 * Mask PII in chunk text for trace storage
 */
export function maskChunkText(
  text: string,
  config: Partial<PiiMaskingConfig> = {}
): ChunkMaskResult {
  const cfg = { ...DEFAULT_PII_MASKING_CONFIG, ...config };

  if (!cfg.maskChunkText || !text) {
    return {
      text,
      piiDetected: false,
      detectionCount: 0,
      truncated: false,
    };
  }

  const { maskedText, detections, truncated } = maskExtendedPII(text, cfg);

  return {
    text: maskedText,
    piiDetected: detections.length > 0,
    detectionCount: detections.length,
    truncated,
  };
}

/**
 * Mask PII in multiple chunks (batch operation)
 */
export function maskChunksBatch(
  chunks: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>,
  config: Partial<PiiMaskingConfig> = {}
): Array<{ id: string; text: string; metadata?: Record<string, unknown>; piiMasked: boolean }> {
  const cfg = { ...DEFAULT_PII_MASKING_CONFIG, ...config };

  return chunks.map((chunk) => {
    const textResult = maskChunkText(chunk.text, cfg);
    const maskedMetadata = chunk.metadata
      ? maskPayloadPII(chunk.metadata, cfg)
      : undefined;

    return {
      id: chunk.id,
      text: textResult.text,
      metadata: maskedMetadata,
      piiMasked: textResult.piiDetected,
    };
  });
}
