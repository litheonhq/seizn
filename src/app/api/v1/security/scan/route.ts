/**
 * Seizn Security Scan API
 *
 * POST /api/v1/security/scan
 * Scan text for PII and secrets
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { processPII, scanPII, type PipelineResult, type PipelineConfig } from '@/lib/security/pii-pipeline';
import { SECRET_PATTERNS, type SecretType } from '@/lib/security/secret-patterns';
import { validateApiKey } from '@/lib/auth/api-key';
import { createApiResponse, createApiError } from '@/lib/api-response';

// ============================================
// Request Validation Schema
// ============================================

const ScanRequestSchema = z.object({
  text: z.string().min(1).max(100000), // Max 100KB
  mode: z.enum(['fast', 'standard', 'strict']).optional().default('standard'),
  action: z.enum(['allow', 'mask', 'redact', 'hash', 'deny']).optional().default('mask'),
  include_secrets: z.boolean().optional().default(true),
  include_pii: z.boolean().optional().default(true),
  language: z.string().optional().default('en'),
  min_confidence: z.number().min(0).max(1).optional().default(0.7),
  return_masked: z.boolean().optional().default(true),
});

type ScanRequest = z.infer<typeof ScanRequestSchema>;

// ============================================
// Response Types
// ============================================

interface SecretMatch {
  type: SecretType;
  value: string;
  start: number;
  end: number;
  confidence: number;
  severity: string;
  description: string;
  masked_value?: string;
}

interface ScanResponse {
  // Overall status
  clean: boolean;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';

  // PII results
  pii?: {
    found: boolean;
    count: number;
    types: string[];
    entities: Array<{
      type: string;
      value?: string;
      masked_value?: string;
      start: number;
      end: number;
      confidence: number;
      source: string;
    }>;
  };

  // Secret results
  secrets?: {
    found: boolean;
    count: number;
    types: string[];
    entities: SecretMatch[];
  };

  // Processed text (if requested)
  processed_text?: string;

  // Metadata
  mode: string;
  action: string;
  processing_time_ms: number;
}

// ============================================
// Secret Scanner
// ============================================

function scanSecrets(
  text: string,
  minConfidence: number,
  action: string
): { matches: SecretMatch[]; processedText: string } {
  const matches: SecretMatch[] = [];
  const seenRanges = new Set<string>();
  let processedText = text;

  // Collect all matches
  for (const patternDef of SECRET_PATTERNS) {
    if (patternDef.confidence < minConfidence) continue;

    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchedValue = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + matchedValue.length;
      const rangeKey = `${startIndex}-${endIndex}`;

      if (seenRanges.has(rangeKey)) continue;

      // Run validator if exists
      let confidence = patternDef.confidence;
      if (patternDef.validator) {
        if (!patternDef.validator(matchedValue)) {
          continue;
        }
        confidence = Math.min(confidence + 0.05, 1.0);
      }

      seenRanges.add(rangeKey);

      const secretMatch: SecretMatch = {
        type: patternDef.type,
        value: matchedValue,
        start: startIndex,
        end: endIndex,
        confidence,
        severity: patternDef.severity,
        description: patternDef.description,
      };

      matches.push(secretMatch);
    }
  }

  // Sort by position
  matches.sort((a, b) => a.start - b.start);

  // Apply masking/redaction (in reverse order to preserve indices)
  if (action !== 'allow' && matches.length > 0) {
    const sortedDesc = [...matches].sort((a, b) => b.start - a.start);

    for (const match of sortedDesc) {
      let maskedValue: string;

      switch (action) {
        case 'mask':
          maskedValue = maskSecret(match.value, match.type);
          break;
        case 'redact':
          maskedValue = `[${match.type.toUpperCase()}]`;
          break;
        case 'hash':
          maskedValue = `[HASH:${simpleHash(match.value).slice(0, 8)}]`;
          break;
        default:
          maskedValue = '*'.repeat(match.value.length);
      }

      match.masked_value = maskedValue;
      processedText =
        processedText.slice(0, match.start) +
        maskedValue +
        processedText.slice(match.end);
    }
  }

  return { matches, processedText };
}

function maskSecret(value: string, type: SecretType): string {
  // Show prefix and suffix based on type
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }

  // For API keys, show prefix
  if (type.includes('api_key') || type.includes('token')) {
    const underscoreIdx = value.indexOf('_');
    if (underscoreIdx > 0 && underscoreIdx < 10) {
      return `${value.slice(0, underscoreIdx + 1)}****...${value.slice(-4)}`;
    }
    return `${value.slice(0, 4)}****...${value.slice(-4)}`;
  }

  // For connection strings, show protocol
  if (type.includes('connection_string') || type.includes('_url')) {
    const colonIdx = value.indexOf('://');
    if (colonIdx > 0) {
      return `${value.slice(0, colonIdx + 3)}****...****`;
    }
  }

  // For webhooks, show domain
  if (type.includes('webhook')) {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}/****`;
    } catch {
      // Not a valid URL
    }
  }

  // Default masking
  return `${value.slice(0, 4)}****...${value.slice(-4)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ============================================
// Risk Level Calculation
// ============================================

function calculateRiskLevel(
  piiCount: number,
  piiTypes: string[],
  secretMatches: SecretMatch[]
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  // Critical secrets
  const criticalSecrets = secretMatches.filter((s) => s.severity === 'critical');
  if (criticalSecrets.length > 0) {
    return 'critical';
  }

  // High severity secrets or multiple PII types
  const highSecrets = secretMatches.filter((s) => s.severity === 'high');
  if (highSecrets.length > 0 || piiTypes.includes('ssn') || piiTypes.includes('rrn')) {
    return 'high';
  }

  // Multiple PII items
  if (piiCount > 3 || piiTypes.length > 2) {
    return 'medium';
  }

  // Some PII or low secrets
  if (piiCount > 0 || secretMatches.length > 0) {
    return 'low';
  }

  return 'none';
}

// ============================================
// POST Handler
// ============================================

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    // Authenticate request
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return createApiError(401, 'UNAUTHORIZED', auth.error || 'Invalid API key');
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = ScanRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return createApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid request body',
        parseResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }))
      );
    }

    const scanRequest = parseResult.data;
    let processedText = scanRequest.text;

    // Initialize response
    const response: ScanResponse = {
      clean: true,
      risk_level: 'none',
      mode: scanRequest.mode,
      action: scanRequest.action,
      processing_time_ms: 0,
    };

    // Scan for PII
    if (scanRequest.include_pii) {
      const piiConfig: Partial<PipelineConfig> = {
        mode: scanRequest.mode as PipelineConfig['mode'],
        defaultAction: scanRequest.action as PipelineConfig['defaultAction'],
        language: scanRequest.language,
        minConfidence: scanRequest.min_confidence,
        enableAudit: false,
      };

      const piiResult = await processPII(processedText, piiConfig);

      response.pii = {
        found: piiResult.found,
        count: piiResult.count,
        types: piiResult.types,
        entities: piiResult.entities.map((e) => ({
          type: e.type,
          value: scanRequest.return_masked ? undefined : e.value,
          masked_value: e.maskedValue,
          start: e.start,
          end: e.end,
          confidence: e.confidence,
          source: e.source,
        })),
      };

      if (piiResult.found) {
        response.clean = false;
        processedText = piiResult.processed;
      }
    }

    // Scan for secrets
    if (scanRequest.include_secrets) {
      const secretResult = scanSecrets(
        processedText,
        scanRequest.min_confidence,
        scanRequest.action
      );

      response.secrets = {
        found: secretResult.matches.length > 0,
        count: secretResult.matches.length,
        types: [...new Set(secretResult.matches.map((m) => m.type))],
        entities: secretResult.matches.map((m) => ({
          ...m,
          value: scanRequest.return_masked ? undefined : m.value,
        })) as SecretMatch[],
      };

      if (secretResult.matches.length > 0) {
        response.clean = false;
        processedText = secretResult.processedText;
      }
    }

    // Calculate risk level
    response.risk_level = calculateRiskLevel(
      response.pii?.count || 0,
      response.pii?.types || [],
      response.secrets?.entities || []
    );

    // Include processed text if requested
    if (scanRequest.return_masked && !response.clean) {
      response.processed_text = processedText;
    }

    // Calculate processing time
    const endTime = performance.now();
    response.processing_time_ms = Math.round((endTime - startTime) * 100) / 100;

    return createApiResponse<ScanResponse>(response);
  } catch (error) {
    console.error('[Security Scan API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// ============================================
// GET Handler - Get scan capabilities
// ============================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return createApiError(401, 'UNAUTHORIZED', auth.error || 'Invalid API key');
    }

    // Return scan capabilities
    return createApiResponse({
      pii_types: [
        'email',
        'phone',
        'phone_kr',
        'credit_card',
        'ssn',
        'rrn',
        'ip_address',
        'ipv6_address',
        'api_key_openai',
        'api_key_seizn',
        'api_key_stripe',
        'api_key_generic',
        'aws_access_key',
        'github_token',
        'jwt',
        'PERSON',
        'LOCATION',
        'DATE_TIME',
      ],
      secret_types: [...new Set(SECRET_PATTERNS.map((p) => p.type))],
      modes: ['fast', 'standard', 'strict'],
      actions: ['allow', 'mask', 'redact', 'hash', 'deny'],
      languages: ['en', 'ko', 'ja', 'zh'],
      limits: {
        max_text_length: 100000,
        default_min_confidence: 0.7,
      },
    });
  } catch (error) {
    console.error('[Security Scan Info API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
