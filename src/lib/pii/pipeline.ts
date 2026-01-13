/**
 * PII Pipeline Integration
 *
 * Provides a high-level interface for processing content through
 * the PII scanner before writing to the database.
 */

import { scanForPII, maskPII, type PIIMatch, type PIIType, type PIIScanResult } from './scanner';
import {
  getPIIConfig,
  getEffectivePolicy,
  shouldScanNamespace,
  type PIIAction,
} from './config';

// =============================================================================
// Types
// =============================================================================

export interface PIIProcessResult {
  /** Whether the content is allowed to be written */
  allowed: boolean;

  /** The content to write (may be masked) */
  content: string;

  /** Original content (if different from output) */
  originalContent?: string;

  /** Whether the content was modified (masked) */
  wasModified: boolean;

  /** Detailed scan results */
  scanResult: PIIScanResult;

  /** Any warnings to log */
  warnings: PIIWarning[];

  /** Error message if blocked */
  error?: PIIBlockError;
}

export interface PIIWarning {
  type: PIIType;
  message: string;
  confidence: number;
}

export interface PIIBlockError {
  code: 'PII_BLOCKED';
  message: string;
  blockedTypes: PIIType[];
  maskedPreview?: string;
}

// =============================================================================
// Main Processing Function
// =============================================================================

/**
 * Process content through PII scanner before writing
 *
 * This is the main entry point for the Write Pipeline integration.
 * It scans content, applies policies, and returns processed content
 * with appropriate action taken (block, mask, or allow).
 *
 * @param content - The content to process
 * @param namespace - The namespace (affects policy)
 * @returns Processing result with allowed status and processed content
 */
export function processPIIForWrite(
  content: string,
  namespace: string = 'default'
): PIIProcessResult {
  const config = getPIIConfig();

  // Check if scanning should be performed for this namespace
  if (!shouldScanNamespace(namespace, config)) {
    return {
      allowed: true,
      content,
      wasModified: false,
      scanResult: {
        hasPII: false,
        detectedTypes: [],
        confidence: 0,
        details: [],
      },
      warnings: [],
    };
  }

  // Scan the content
  const scanResult = scanForPII(content, {
    confidenceThreshold: config.globalConfidenceThreshold,
  });

  // If no PII detected, allow as-is
  if (!scanResult.hasPII) {
    return {
      allowed: true,
      content,
      wasModified: false,
      scanResult,
      warnings: [],
    };
  }

  // Categorize matches by action
  const categorized = categorizePIIMatches(scanResult.details, namespace, config);

  // If there are blocked types, reject the write
  if (categorized.block.length > 0) {
    const blockedTypes = Array.from(new Set(categorized.block.map(m => m.type)));
    const blockMessages = blockedTypes.map(type => {
      const policy = getEffectivePolicy(type, namespace, config);
      return policy.blockMessage || `${type} is not allowed`;
    });

    // Generate masked preview if configured
    let maskedPreview: string | undefined;
    if (config.includeMaskedInError) {
      maskedPreview = maskPII(content, scanResult.details);
    }

    return {
      allowed: false,
      content,
      wasModified: false,
      scanResult,
      warnings: generateWarnings(categorized.warn),
      error: {
        code: 'PII_BLOCKED',
        message: blockMessages.join('; '),
        blockedTypes,
        maskedPreview,
      },
    };
  }

  // Apply masking if needed
  let processedContent = content;
  let wasModified = false;

  if (categorized.mask.length > 0) {
    processedContent = maskPII(content, categorized.mask);
    wasModified = true;
    scanResult.maskedContent = processedContent;
  }

  // Generate warnings
  const warnings = generateWarnings(categorized.warn);

  // Log detections if configured
  if (config.logDetections && scanResult.details.length > 0) {
    logPIIDetection(scanResult, namespace, categorized);
  }

  return {
    allowed: true,
    content: processedContent,
    originalContent: wasModified ? content : undefined,
    wasModified,
    scanResult,
    warnings,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

interface CategorizedMatches {
  block: PIIMatch[];
  mask: PIIMatch[];
  warn: PIIMatch[];
  allow: PIIMatch[];
}

/**
 * Categorize PII matches by their policy action
 */
function categorizePIIMatches(
  matches: PIIMatch[],
  namespace: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
): CategorizedMatches {
  const result: CategorizedMatches = {
    block: [],
    mask: [],
    warn: [],
    allow: [],
  };

  for (const match of matches) {
    const policy = getEffectivePolicy(match.type, namespace, config);
    const threshold = policy.confidenceThreshold ?? config.globalConfidenceThreshold;

    // Only apply policy if match confidence meets threshold
    if (match.confidence >= threshold) {
      const action = policy.action as PIIAction;
      result[action].push(match);
    } else {
      // Below threshold, treat as allowed
      result.allow.push(match);
    }
  }

  return result;
}

/**
 * Generate warning messages for warn-action matches
 */
function generateWarnings(matches: PIIMatch[]): PIIWarning[] {
  return matches.map(match => ({
    type: match.type,
    message: `Detected potential ${match.type} in content`,
    confidence: match.confidence,
  }));
}

/**
 * Log PII detection (without actual values)
 */
function logPIIDetection(
  scanResult: PIIScanResult,
  namespace: string,
  categorized: CategorizedMatches
): void {
  const summary = {
    timestamp: new Date().toISOString(),
    namespace,
    detectedTypes: scanResult.detectedTypes,
    counts: {
      blocked: categorized.block.length,
      masked: categorized.mask.length,
      warned: categorized.warn.length,
      allowed: categorized.allow.length,
    },
    highestConfidence: scanResult.confidence,
  };

  // Log to console in development, could be sent to logging service
  if (process.env.NODE_ENV === 'development') {
    console.log('[PII Detection]', JSON.stringify(summary));
  }

  // TODO: In production, send to logging/analytics service
  // await logToService('pii-detection', summary);
}

// =============================================================================
// Utility Functions for API Routes
// =============================================================================

/**
 * Create an error response for blocked PII
 */
export function createPIIBlockedResponse(error: PIIBlockError): {
  success: false;
  error: {
    code: string;
    message: string;
    blockedTypes: PIIType[];
    maskedPreview?: string;
  };
} {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      blockedTypes: error.blockedTypes,
      maskedPreview: error.maskedPreview,
    },
  };
}

/**
 * Check if content passes PII policy (quick check without full processing)
 */
export function contentPassesPIIPolicy(
  content: string,
  namespace: string = 'default'
): boolean {
  const result = processPIIForWrite(content, namespace);
  return result.allowed;
}
