/**
 * Presidio PII Detection Client
 *
 * Integration with Microsoft Presidio for advanced NER-based PII detection.
 * Presidio provides entity recognition for names, addresses, and context-aware detection.
 *
 * Deployment options:
 * - Self-hosted: docker run -p 5002:5002 mcr.microsoft.com/presidio-analyzer
 * - Azure AI: Use Presidio as part of Azure AI services
 *
 * @see https://microsoft.github.io/presidio/
 */

// ============================================
// Types
// ============================================

/**
 * Presidio entity types
 * Extended list of recognizable entities
 */
export type PresidioEntityType =
  // Personal Identifiers
  | 'PERSON'
  | 'EMAIL_ADDRESS'
  | 'PHONE_NUMBER'
  | 'DATE_TIME'
  | 'NRP' // Nationality, Religious, Political group
  | 'LOCATION'
  | 'MEDICAL_LICENSE'
  | 'URL'
  // Government IDs
  | 'US_SSN'
  | 'US_PASSPORT'
  | 'US_DRIVER_LICENSE'
  | 'UK_NHS'
  | 'AU_ABN'
  | 'AU_ACN'
  | 'AU_TFN'
  | 'AU_MEDICARE'
  // Korean IDs
  | 'KR_RRN'
  | 'KR_PASSPORT'
  | 'KR_DRIVER_LICENSE'
  // Financial
  | 'CREDIT_CARD'
  | 'IBAN_CODE'
  | 'US_BANK_NUMBER'
  | 'CRYPTO'
  // Technical
  | 'IP_ADDRESS'
  | 'AWS_ACCESS_KEY'
  | 'AZURE_STORAGE_KEY'
  | 'SG_NRIC_FIN';

/**
 * Recognition result from Presidio
 */
export interface PresidioRecognizerResult {
  entity_type: PresidioEntityType;
  start: number;
  end: number;
  score: number;
  analysis_explanation?: {
    recognizer: string;
    pattern_name?: string;
    pattern?: string;
    original_score: number;
    score: number;
    textual_explanation?: string;
    score_context_improvement?: number;
    supportive_context_word?: string;
    validation_result?: number;
  };
  recognition_metadata?: Record<string, unknown>;
}

/**
 * Analyze request
 */
export interface PresidioAnalyzeRequest {
  text: string;
  language?: string;
  entities?: PresidioEntityType[];
  correlation_id?: string;
  score_threshold?: number;
  return_decision_process?: boolean;
  ad_hoc_recognizers?: AdHocRecognizer[];
  context?: string[];
}

/**
 * Custom recognizer for ad-hoc detection
 */
export interface AdHocRecognizer {
  name: string;
  supported_language: string;
  patterns: Array<{
    name: string;
    regex: string;
    score: number;
  }>;
  context?: string[];
  supported_entity: string;
}

/**
 * Anonymize request
 */
export interface PresidioAnonymizeRequest {
  text: string;
  analyzer_results: PresidioRecognizerResult[];
  operators?: Record<string, AnonymizeOperator>;
}

/**
 * Anonymization operator
 */
export type AnonymizeOperator =
  | { type: 'replace'; new_value: string }
  | { type: 'redact' }
  | { type: 'hash'; hash_type?: 'md5' | 'sha256' | 'sha512' }
  | { type: 'mask'; masking_char?: string; chars_to_mask?: number; from_end?: boolean }
  | { type: 'encrypt'; key: string }
  | { type: 'custom'; lambda: string };

/**
 * Anonymize response
 */
export interface PresidioAnonymizeResponse {
  text: string;
  items: Array<{
    start: number;
    end: number;
    entity_type: PresidioEntityType;
    text: string;
    operator: string;
  }>;
}

// ============================================
// Presidio Client Configuration
// ============================================

export interface PresidioClientConfig {
  /** Presidio Analyzer service URL */
  analyzerUrl: string;
  /** Presidio Anonymizer service URL */
  anonymizerUrl: string;
  /** Default language for analysis */
  defaultLanguage?: string;
  /** Default score threshold (0-1) */
  scoreThreshold?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Enable caching */
  enableCache?: boolean;
  /** Cache TTL in ms */
  cacheTtl?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

// ============================================
// Presidio Client Class
// ============================================

export class PresidioClient {
  private config: Required<PresidioClientConfig>;
  private cache: Map<string, { result: PresidioRecognizerResult[]; timestamp: number }>;

  constructor(config: Partial<PresidioClientConfig> = {}) {
    this.config = {
      analyzerUrl: config.analyzerUrl || process.env.PRESIDIO_ANALYZER_URL || 'http://localhost:5002',
      anonymizerUrl: config.anonymizerUrl || process.env.PRESIDIO_ANONYMIZER_URL || 'http://localhost:5001',
      defaultLanguage: config.defaultLanguage || 'en',
      scoreThreshold: config.scoreThreshold ?? 0.5,
      timeout: config.timeout ?? 30000,
      enableCache: config.enableCache ?? true,
      cacheTtl: config.cacheTtl ?? 60000, // 1 minute
      headers: config.headers || {},
    };
    this.cache = new Map();
  }

  /**
   * Analyze text for PII entities
   */
  async analyze(request: PresidioAnalyzeRequest): Promise<PresidioRecognizerResult[]> {
    const { text, language, entities, score_threshold, return_decision_process, context } = request;

    // Check cache
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(text, language, entities);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
        return cached.result;
      }
    }

    // Build request body
    const body: Record<string, unknown> = {
      text,
      language: language || this.config.defaultLanguage,
      score_threshold: score_threshold ?? this.config.scoreThreshold,
    };

    if (entities && entities.length > 0) {
      body.entities = entities;
    }

    if (return_decision_process) {
      body.return_decision_process = true;
    }

    if (request.ad_hoc_recognizers) {
      body.ad_hoc_recognizers = request.ad_hoc_recognizers;
    }

    if (context && context.length > 0) {
      body.context = context;
    }

    // Call Presidio Analyzer
    const response = await this.fetchWithTimeout(`${this.config.analyzerUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Presidio analysis failed: ${response.status} - ${error}`);
    }

    const results = (await response.json()) as PresidioRecognizerResult[];

    // Cache results
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(text, language, entities);
      this.cache.set(cacheKey, { result: results, timestamp: Date.now() });
    }

    return results;
  }

  /**
   * Anonymize text based on analysis results
   */
  async anonymize(request: PresidioAnonymizeRequest): Promise<PresidioAnonymizeResponse> {
    const { text, analyzer_results, operators } = request;

    const body: Record<string, unknown> = {
      text,
      analyzer_results,
    };

    if (operators) {
      body.operators = operators;
    }

    const response = await this.fetchWithTimeout(`${this.config.anonymizerUrl}/anonymize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Presidio anonymization failed: ${response.status} - ${error}`);
    }

    return (await response.json()) as PresidioAnonymizeResponse;
  }

  /**
   * Analyze and anonymize in one call
   */
  async analyzeAndAnonymize(
    text: string,
    options?: {
      language?: string;
      entities?: PresidioEntityType[];
      operators?: Record<string, AnonymizeOperator>;
    }
  ): Promise<{
    original: string;
    anonymized: string;
    entities: PresidioRecognizerResult[];
  }> {
    const analyzerResults = await this.analyze({
      text,
      language: options?.language,
      entities: options?.entities,
    });

    if (analyzerResults.length === 0) {
      return {
        original: text,
        anonymized: text,
        entities: [],
      };
    }

    const anonymized = await this.anonymize({
      text,
      analyzer_results: analyzerResults,
      operators: options?.operators || this.getDefaultOperators(),
    });

    return {
      original: text,
      anonymized: anonymized.text,
      entities: analyzerResults,
    };
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{ analyzer: boolean; anonymizer: boolean }> {
    let analyzerOk = false;
    let anonymizerOk = false;

    try {
      const analyzerResponse = await this.fetchWithTimeout(`${this.config.analyzerUrl}/health`, {
        method: 'GET',
      });
      analyzerOk = analyzerResponse.ok;
    } catch {
      analyzerOk = false;
    }

    try {
      const anonymizerResponse = await this.fetchWithTimeout(`${this.config.anonymizerUrl}/health`, {
        method: 'GET',
      });
      anonymizerOk = anonymizerResponse.ok;
    } catch {
      anonymizerOk = false;
    }

    return { analyzer: analyzerOk, anonymizer: anonymizerOk };
  }

  /**
   * Get supported entities
   */
  async getSupportedEntities(language?: string): Promise<string[]> {
    const lang = language || this.config.defaultLanguage;
    const response = await this.fetchWithTimeout(
      `${this.config.analyzerUrl}/supportedentities?language=${lang}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get supported entities: ${response.status}`);
    }

    return (await response.json()) as string[];
  }

  /**
   * Get available recognizers
   */
  async getRecognizers(language?: string): Promise<string[]> {
    const lang = language || this.config.defaultLanguage;
    const response = await this.fetchWithTimeout(
      `${this.config.analyzerUrl}/recognizers?language=${lang}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get recognizers: ${response.status}`);
    }

    return (await response.json()) as string[];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get default anonymization operators
   */
  private getDefaultOperators(): Record<string, AnonymizeOperator> {
    return {
      DEFAULT: { type: 'mask', masking_char: '*', chars_to_mask: -1, from_end: false },
      PERSON: { type: 'replace', new_value: '[NAME]' },
      EMAIL_ADDRESS: { type: 'mask', masking_char: '*', chars_to_mask: -1 },
      PHONE_NUMBER: { type: 'mask', masking_char: '*', chars_to_mask: 6, from_end: false },
      CREDIT_CARD: { type: 'mask', masking_char: '*', chars_to_mask: 12, from_end: false },
      US_SSN: { type: 'mask', masking_char: '*', chars_to_mask: 5, from_end: false },
      KR_RRN: { type: 'mask', masking_char: '*', chars_to_mask: -1 },
      LOCATION: { type: 'replace', new_value: '[LOCATION]' },
      IP_ADDRESS: { type: 'mask', masking_char: '*', chars_to_mask: -1 },
    };
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    text: string,
    language?: string,
    entities?: PresidioEntityType[]
  ): string {
    const parts = [
      text.slice(0, 100), // First 100 chars
      language || this.config.defaultLanguage,
      entities?.sort().join(',') || 'all',
    ];
    return parts.join('|');
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================
// Custom Recognizers for Korean
// ============================================

/**
 * Korean-specific ad-hoc recognizers
 */
export const KOREAN_RECOGNIZERS: AdHocRecognizer[] = [
  {
    name: 'KoreanRRNRecognizer',
    supported_language: 'ko',
    supported_entity: 'KR_RRN',
    patterns: [
      {
        name: 'rrn_with_dash',
        regex: '[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])-[1-8][0-9]{6}',
        score: 0.9,
      },
      {
        name: 'rrn_no_dash',
        regex: '[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[1-8][0-9]{6}',
        score: 0.85,
      },
    ],
    context: ['주민등록번호', '주민번호', 'RRN', '생년월일'],
  },
  {
    name: 'KoreanPhoneRecognizer',
    supported_language: 'ko',
    supported_entity: 'PHONE_NUMBER',
    patterns: [
      {
        name: 'korean_phone',
        regex: '0[1-9][0-9]?-[0-9]{3,4}-[0-9]{4}',
        score: 0.85,
      },
      {
        name: 'korean_phone_no_dash',
        regex: '01[0-9][0-9]{7,8}',
        score: 0.8,
      },
    ],
    context: ['전화번호', '연락처', '핸드폰', '휴대폰'],
  },
  {
    name: 'KoreanPassportRecognizer',
    supported_language: 'ko',
    supported_entity: 'KR_PASSPORT',
    patterns: [
      {
        name: 'korean_passport',
        regex: '[A-Z]{1,2}[0-9]{7,8}',
        score: 0.7,
      },
    ],
    context: ['여권번호', '여권', 'passport'],
  },
];

// ============================================
// Default Client Instance
// ============================================

let defaultClient: PresidioClient | null = null;

/**
 * Get default Presidio client
 */
export function getPresidioClient(): PresidioClient {
  if (!defaultClient) {
    defaultClient = new PresidioClient();
  }
  return defaultClient;
}

/**
 * Configure default client
 */
export function configurePresidioClient(config: Partial<PresidioClientConfig>): void {
  defaultClient = new PresidioClient(config);
}

/**
 * Quick analyze helper
 */
export async function analyzeText(
  text: string,
  options?: {
    language?: string;
    entities?: PresidioEntityType[];
  }
): Promise<PresidioRecognizerResult[]> {
  const client = getPresidioClient();
  return client.analyze({
    text,
    language: options?.language,
    entities: options?.entities,
  });
}

/**
 * Quick anonymize helper
 */
export async function anonymizeText(
  text: string,
  options?: {
    language?: string;
    entities?: PresidioEntityType[];
    operators?: Record<string, AnonymizeOperator>;
  }
): Promise<string> {
  const client = getPresidioClient();
  const result = await client.analyzeAndAnonymize(text, options);
  return result.anonymized;
}
