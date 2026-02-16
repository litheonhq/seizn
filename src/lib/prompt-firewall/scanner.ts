/**
 * Prompt Firewall Scanner
 * Security scanning for prompt injection and other threats
 */

import { THREAT_PATTERNS, compareThreatLevel, type ThreatLevel } from './patterns';
import { PromptInjectionDetector } from './detector';

// ============================================
// Types
// ============================================

export interface ScanResult {
  detected: boolean;
  threatLevel: ThreatLevel;
  matches: Array<{
    patternId: string;
    patternName: string;
    level: ThreatLevel;
    category: string;
  }>;
}

export interface Scanner {
  scan: (input: string) => Promise<ScanResult>;
}

export interface FirewallConfig {
  enabled: boolean;
  mode: 'block' | 'sanitize' | 'warn';
  customPatterns?: Array<{
    name: string;
    pattern: RegExp;
    level: ThreatLevel;
    category: string;
  }>;
}

export interface ScanRequest {
  input: string;
  options?: {
    returnSanitized?: boolean;
    includeMatches?: boolean;
  };
}

export interface ThreatInfo {
  category: string;
  level: ThreatLevel;
  description: string;
}

export interface ScanResponse {
  safe: boolean;
  threatLevel: ThreatLevel;
  action: 'allowed' | 'blocked' | 'sanitized';
  threats: ThreatInfo[];
  sanitizedInput?: string;
}

export interface DetectorResult {
  detected: boolean;
  threatLevel: ThreatLevel;
  threats: Array<{
    category: string;
    level: ThreatLevel;
    patternName: string;
    matchedText: string;
  }>;
  sanitizedInput?: string;
}

export interface Detector {
  scan: (input: string) => DetectorResult;
}

/**
 * Create a prompt firewall scanner
 */
export function createScanner(policyId?: string): Scanner {
  // Filter patterns based on policy (if provided)
  const activePatterns = policyId
    ? THREAT_PATTERNS.filter((p) => p.enabled)
    : THREAT_PATTERNS.filter((p) => p.enabled);

  return {
    scan: async (input: string): Promise<ScanResult> => {
      const matches: ScanResult['matches'] = [];
      let maxLevel: ThreatLevel = 'none';

      for (const pattern of activePatterns) {
        if (pattern.pattern.test(input)) {
          matches.push({
            patternId: pattern.id,
            patternName: pattern.name,
            level: pattern.level,
            category: pattern.category,
          });

          if (compareThreatLevel(pattern.level, maxLevel) > 0) {
            maxLevel = pattern.level;
          }
        }
      }

      return {
        detected: matches.length > 0,
        threatLevel: maxLevel,
        matches,
      };
    },
  };
}

/**
 * Quick scan for high-severity threats only
 */
export async function quickScan(input: string): Promise<boolean> {
  const scanner = createScanner();
  const result = await scanner.scan(input);
  return result.detected && compareThreatLevel(result.threatLevel, 'high') >= 0;
}

/**
 * Create a threat detector (synchronous version)
 */
export function createDetector(config?: Partial<FirewallConfig>): Detector {
  const mode = config?.mode === 'sanitize' ? 'sanitize' : config?.mode === 'warn' ? 'monitor' : 'block';
  const coreDetector = new PromptInjectionDetector({
    enabled: config?.enabled ?? true,
    mode,
    minThreatLevel: 'low',
    logDetections: false,
    alertOnCritical: true,
  });

  return {
    scan: (input: string): DetectorResult => {
      const result = coreDetector.scan(input);
      const threats: DetectorResult['threats'] = result.threats.map((threat) => ({
        category: threat.category,
        level: threat.level,
        patternName: threat.patternName,
        matchedText: threat.matchedText,
      }));

      return {
        detected: result.detected,
        threatLevel: result.threatLevel,
        threats,
        sanitizedInput: mode === 'sanitize' ? result.sanitizedInput : undefined,
      };
    },
  };
}
