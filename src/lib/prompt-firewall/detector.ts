/**
 * Prompt Injection Firewall - Detector
 *
 * Core detection engine for identifying prompt injection attacks.
 */

import type {
  ThreatPattern,
  ThreatLevel,
  ThreatCategory,
  DetectionResult,
  DetectedThreat,
  FirewallConfig,
} from './types';
import {
  DEFAULT_PATTERNS,
  getHighestThreatLevel,
  THREAT_LEVEL_PRIORITY,
} from './patterns';

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_CONFIG: FirewallConfig = {
  enabled: true,
  mode: 'block',
  minThreatLevel: 'medium',
  logDetections: true,
  alertOnCritical: true,
  maxInputLength: 100000,
};

// ============================================
// Detector Class
// ============================================

export class PromptInjectionDetector {
  private config: FirewallConfig;
  private patterns: ThreatPattern[];

  constructor(config: Partial<FirewallConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = this.buildPatternList();
  }

  /**
   * Build the pattern list based on configuration
   */
  private buildPatternList(): ThreatPattern[] {
    let patterns = [...DEFAULT_PATTERNS];

    // Add custom patterns if provided
    if (this.config.customPatterns) {
      patterns = [...patterns, ...this.config.customPatterns];
    }

    // Filter out disabled categories
    if (this.config.disabledCategories?.length) {
      patterns = patterns.filter(
        (p) => !this.config.disabledCategories?.includes(p.category)
      );
    }

    // Filter by minimum threat level
    const minPriority = THREAT_LEVEL_PRIORITY[this.config.minThreatLevel];
    patterns = patterns.filter(
      (p) => p.enabled && THREAT_LEVEL_PRIORITY[p.level] >= minPriority
    );

    return patterns;
  }

  /**
   * Scan input for prompt injection attempts
   */
  scan(input: string): DetectionResult {
    const startTime = performance.now();
    const threats: DetectedThreat[] = [];

    // Check if firewall is enabled
    if (!this.config.enabled) {
      return {
        detected: false,
        threatLevel: 'none',
        threats: [],
        metadata: {
          processingTimeMs: performance.now() - startTime,
          patternsChecked: 0,
          inputLength: input.length,
        },
      };
    }

    // Check input length
    if (this.config.maxInputLength && input.length > this.config.maxInputLength) {
      threats.push({
        patternId: 'sys-001',
        patternName: 'Input Too Long',
        category: 'denial_of_service',
        level: 'medium',
        matchedText: `Input length: ${input.length}`,
        position: { start: 0, end: input.length },
        confidence: 1.0,
      });
    }

    // Check each pattern
    for (const pattern of this.patterns) {
      const matches = this.findMatches(input, pattern);
      threats.push(...matches);
    }

    // Calculate overall threat level
    const threatLevel = threats.length > 0
      ? getHighestThreatLevel(threats.map((t) => t.level))
      : 'none';

    return {
      detected: threats.length > 0,
      threatLevel,
      threats,
      sanitizedInput: this.config.mode === 'sanitize' ? this.sanitize(input, threats) : undefined,
      metadata: {
        processingTimeMs: performance.now() - startTime,
        patternsChecked: this.patterns.length,
        inputLength: input.length,
      },
    };
  }

  /**
   * Find all matches for a pattern in the input
   */
  private findMatches(input: string, pattern: ThreatPattern): DetectedThreat[] {
    const threats: DetectedThreat[] = [];
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags + 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      threats.push({
        patternId: pattern.id,
        patternName: pattern.name,
        category: pattern.category,
        level: pattern.level,
        matchedText: match[0],
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
        confidence: this.calculateConfidence(match[0], pattern),
      });

      // Prevent infinite loops on zero-width matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return threats;
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(matchedText: string, pattern: ThreatPattern): number {
    // Base confidence from threat level
    const levelConfidence = {
      critical: 0.95,
      high: 0.85,
      medium: 0.70,
      low: 0.50,
      none: 0.30,
    };

    let confidence = levelConfidence[pattern.level];

    // Adjust based on match length (longer matches = higher confidence)
    if (matchedText.length > 20) {
      confidence = Math.min(1.0, confidence + 0.05);
    }

    return confidence;
  }

  /**
   * Sanitize input by removing/replacing detected threats
   */
  private sanitize(input: string, threats: DetectedThreat[]): string {
    if (threats.length === 0) return input;

    // Sort threats by position (descending) to replace from end to start
    const sortedThreats = [...threats].sort(
      (a, b) => b.position.start - a.position.start
    );

    let sanitized = input;
    for (const threat of sortedThreats) {
      const before = sanitized.slice(0, threat.position.start);
      const after = sanitized.slice(threat.position.end);
      const replacement = '[REDACTED]';
      sanitized = before + replacement + after;
    }

    return sanitized;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FirewallConfig>): void {
    this.config = { ...this.config, ...config };
    this.patterns = this.buildPatternList();
  }

  /**
   * Get current configuration
   */
  getConfig(): FirewallConfig {
    return { ...this.config };
  }

  /**
   * Get active pattern count
   */
  getPatternCount(): number {
    return this.patterns.length;
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a detector with default configuration
 */
export function createDetector(config?: Partial<FirewallConfig>): PromptInjectionDetector {
  return new PromptInjectionDetector(config);
}

/**
 * Quick scan with default configuration
 */
export function quickScan(input: string): DetectionResult {
  const detector = new PromptInjectionDetector();
  return detector.scan(input);
}

/**
 * Check if input is safe (no threats above minimum level)
 */
export function isSafe(input: string, minLevel: ThreatLevel = 'medium'): boolean {
  const detector = new PromptInjectionDetector({ minThreatLevel: minLevel });
  const result = detector.scan(input);
  return !result.detected;
}
