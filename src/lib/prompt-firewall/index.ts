/**
 * Prompt Injection Firewall
 *
 * A comprehensive prompt injection detection and prevention system.
 *
 * @example
 * ```typescript
 * import { createDetector, quickScan, isSafe } from '@/lib/prompt-firewall';
 *
 * // Quick check
 * const safe = isSafe(userInput);
 *
 * // Full scan
 * const result = quickScan(userInput);
 * if (result.detected) {
 *   console.log('Threats found:', result.threats);
 * }
 *
 * // Custom detector
 * const detector = createDetector({
 *   mode: 'sanitize',
 *   minThreatLevel: 'high',
 * });
 * const scanResult = detector.scan(userInput);
 * ```
 */

// Types
export type {
  ThreatLevel,
  ThreatCategory,
  ThreatPattern,
  DetectionResult,
  DetectedThreat,
  FirewallConfig,
  FirewallPolicy,
  FirewallLogRow,
  FirewallPolicyRow,
  ScanRequest,
  ScanResponse,
  PolicyCreateRequest,
  PolicyUpdateRequest,
} from './types';

// Patterns
export {
  DEFAULT_PATTERNS,
  getPatternsByCategory,
  getPatternsByLevel,
  getPatternById,
  getEnabledPatterns,
  THREAT_LEVEL_PRIORITY,
  compareThreatLevels,
  getHighestThreatLevel,
} from './patterns';

// Detector
export {
  PromptInjectionDetector,
  DEFAULT_CONFIG,
  createDetector,
  quickScan,
  isSafe,
} from './detector';
