/**
 * Prompt Injection Firewall - Types
 *
 * Type definitions for the prompt injection detection and prevention system.
 */

// ============================================
// Detection Types
// ============================================

export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export type ThreatCategory =
  | 'jailbreak'           // Attempts to bypass system instructions
  | 'instruction_override' // Direct instruction manipulation
  | 'data_exfiltration'   // Attempts to extract sensitive data
  | 'role_hijacking'      // Impersonating system/admin roles
  | 'encoding_attack'     // Using encoding to bypass filters
  | 'context_manipulation' // Manipulating conversation context
  | 'indirect_injection'  // Injection via external content
  | 'denial_of_service'   // Resource exhaustion attempts
  | 'excessive_agency'    // LLM08: Unauthorized autonomous actions
  | 'insecure_output'     // LLM02: XSS/SQL/command injection via output
  | 'sensitive_disclosure' // LLM06: PII/credentials extraction
  | 'unbounded_consumption' // LLM10: API/token/storage exhaustion
  | 'unknown';

export interface ThreatPattern {
  id: string;
  name: string;
  category: ThreatCategory;
  level: ThreatLevel;
  pattern: RegExp;
  description: string;
  examples?: string[];
  enabled: boolean;
}

export interface DetectionResult {
  detected: boolean;
  threatLevel: ThreatLevel;
  threats: DetectedThreat[];
  sanitizedInput?: string;
  metadata: {
    processingTimeMs: number;
    patternsChecked: number;
    inputLength: number;
  };
}

export interface DetectedThreat {
  patternId: string;
  patternName: string;
  category: ThreatCategory;
  level: ThreatLevel;
  matchedText: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number; // 0-1
}

// ============================================
// Configuration Types
// ============================================

export interface FirewallConfig {
  enabled: boolean;
  mode: 'block' | 'sanitize' | 'monitor';
  minThreatLevel: ThreatLevel;
  customPatterns?: ThreatPattern[];
  disabledCategories?: ThreatCategory[];
  maxInputLength?: number;
  logDetections: boolean;
  alertOnCritical: boolean;
}

export interface FirewallPolicy {
  id: string;
  name: string;
  description?: string;
  config: FirewallConfig;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Database Types
// ============================================

export interface FirewallLogRow {
  id: string;
  user_id: string;
  org_id?: string;
  input_hash: string;
  threat_level: ThreatLevel;
  threats: DetectedThreat[];
  action_taken: 'blocked' | 'sanitized' | 'allowed' | 'monitored';
  policy_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FirewallPolicyRow {
  id: string;
  user_id: string;
  org_id?: string;
  name: string;
  description?: string;
  config: FirewallConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// API Types
// ============================================

export interface ScanRequest {
  input: string;
  context?: string;
  policyId?: string;
  options?: {
    returnSanitized?: boolean;
    includeMatches?: boolean;
  };
}

export interface ScanResponse {
  safe: boolean;
  threatLevel: ThreatLevel;
  action: 'allowed' | 'blocked' | 'sanitized' | 'monitored';
  threats: Array<{
    category: ThreatCategory;
    level: ThreatLevel;
    description: string;
  }>;
  sanitizedInput?: string;
  logId?: string;
}

export interface PolicyCreateRequest {
  name: string;
  description?: string;
  config: Partial<FirewallConfig>;
}

export interface PolicyUpdateRequest {
  name?: string;
  description?: string;
  config?: Partial<FirewallConfig>;
  isActive?: boolean;
}
