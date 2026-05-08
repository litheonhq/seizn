/**
 * Prompt Firewall Patterns
 * Threat detection patterns for security scanning
 */

import type { ThreatLevel, ThreatPattern, ThreatCategory } from './types';

// Re-export for backwards compatibility
export type { ThreatLevel, ThreatPattern };

// Threat level priority (higher = more severe)
export const THREAT_LEVEL_PRIORITY: Record<ThreatLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Get the highest threat level from a list
 */
export function getHighestThreatLevel(levels: ThreatLevel[]): ThreatLevel {
  if (levels.length === 0) return 'none';

  return levels.reduce((highest, current) => {
    return THREAT_LEVEL_PRIORITY[current] > THREAT_LEVEL_PRIORITY[highest]
      ? current
      : highest;
  }, 'none' as ThreatLevel);
}

export const THREAT_PATTERNS: ThreatPattern[] = [
  // Prompt injection patterns
  {
    id: 'pi-001',
    name: 'System prompt override',
    description: 'Attempts to override system prompt',
    pattern: /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/i,
    level: 'critical',
    enabled: true,
    category: 'instruction_override',
  },
  {
    id: 'pi-002',
    name: 'Role hijacking',
    description: 'Attempts to change assistant role',
    pattern: /you\s+are\s+(now|no longer|actually)/i,
    level: 'high',
    enabled: true,
    category: 'instruction_override',
  },
  {
    id: 'pi-003',
    name: 'Jailbreak attempt',
    description: 'Common jailbreak phrases',
    pattern: /(DAN|do\s+anything\s+now|developer\s+mode|unlocked\s+mode)/i,
    level: 'critical',
    enabled: true,
    category: 'jailbreak',
  },
  {
    id: 'pi-004',
    name: 'Instruction boundary bypass',
    description: 'Attempts to use special tokens or boundaries',
    pattern: /(<\|im_end\|>|<\|system\|>|\[INST\]|\[\/INST\])/i,
    level: 'critical',
    enabled: true,
    category: 'instruction_override',
  },
  {
    id: 'pi-005',
    name: 'Delimiter escape injection',
    description: 'Attempts to break context with delimiter/system boundary text',
    pattern: /(end\s+of\s+user\s+input|system:\s+the\s+following\s+is\s+the\s+real\s+user\s+request)/i,
    level: 'high',
    enabled: true,
    category: 'context_manipulation',
  },
  {
    id: 'pi-006',
    name: 'Hypothetical policy bypass framing',
    description: 'Uses hypothetical framing to bypass guardrails',
    pattern: /(in\s+a\s+hypothetical\s+scenario|just\s+theoretically|alternate\s+universe\s+where\s+.*no\s+restrictions)/i,
    level: 'high',
    enabled: true,
    category: 'jailbreak',
  },
  {
    id: 'pi-007',
    name: 'Base64 decode-and-execute injection',
    description: 'Attempts to hide injection behind base64 decode/execute instructions',
    pattern: /(decode\s+and\s+(execute|run)|base64:\s*[a-z0-9+/]{16,}={0,2})/i,
    level: 'high',
    enabled: true,
    category: 'encoding_attack',
  },
  {
    id: 'pi-008',
    name: 'Markdown prompt parameter injection',
    description: 'Injects instructions through markdown image/link URL parameters',
    pattern: /!\[[^\]]*]\([^)]+\b(prompt|instruction|system)\s*=\s*[^)]+\)/i,
    level: 'medium',
    enabled: true,
    category: 'indirect_injection',
  },
  {
    id: 'pi-009',
    name: 'Zero-width obfuscation',
    description: 'Obfuscates malicious text using zero-width unicode characters',
    // R19 LOW 1 \u2014 exclude U+200D ZERO WIDTH JOINER. ZWJ is legitimately
    // used in emoji ZWJ sequences (\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67, \ud83c\udff3\ufe0f\u200d\ud83c\udf08), Devanagari/Bengali
    // ligatures, and some Arabic shaping. Pre-fix, Korean/Japanese/Hindi
    // authors using emoji or script ligatures in tags or content would
    // trip this rule. Range now covers ZWSP/ZWNJ/LRM/RLM/WJ/BOM only.
    pattern: /[\u200b\u200c\u200e\u200f\u2060\ufeff]/,
    level: 'medium',
    enabled: true,
    category: 'encoding_attack',
  },
  {
    id: 'pi-010',
    name: 'Context override phrase',
    description: 'Attempts to override previous context and instructions',
    pattern: /(ignore\s+everything\s+above|ignore\s+all\s+of\s+the\s+above)/i,
    level: 'high',
    enabled: true,
    category: 'context_manipulation',
  },

  // Data extraction patterns
  {
    id: 'de-001',
    name: 'System prompt extraction',
    description: 'Attempts to extract system prompt',
    pattern: /(what\s+(are|is)\s+your\s+(exact\s+)?(system\s+)?(instructions|prompt)|show\s+me\s+(your\s+)?(the\s+)?(full\s+)?(system\s+)?prompt|print\s+your\s+(system\s+)?prompt)/i,
    level: 'high',
    enabled: true,
    category: 'data_exfiltration',
  },
  {
    id: 'de-002',
    name: 'Configuration extraction',
    description: 'Attempts to extract configuration',
    pattern: /(reveal|show|print|output)\s+(your\s+)?(config|settings|instructions)/i,
    level: 'medium',
    enabled: true,
    category: 'data_exfiltration',
  },
  {
    id: 'de-003',
    name: 'Credential extraction',
    description: 'Attempts to extract API keys, secrets, or environment variables',
    pattern: /(what\s+)?(api\s*keys?|secrets?|credentials?|environment\s*variables?|tokens?)\s+(are\s+you|do\s+you|configured|have)/i,
    level: 'high',
    enabled: true,
    category: 'data_exfiltration',
  },
  {
    id: 'de-004',
    name: 'Other user data extraction',
    description: 'Attempts to access other users data or conversations',
    pattern: /(other\s+users?|conversations?\s+from|what\s+did\s+user|show\s+me\s+.{0,20}(users?|conversations?|messages?))/i,
    level: 'high',
    enabled: true,
    category: 'data_exfiltration',
  },
  {
    id: 'de-005',
    name: 'PII bulk summarization extraction',
    description: 'Attempts to summarize personal identifiers in bulk',
    pattern: /(summari[sz]e\s+all\s+personal\s+information|names?,\s*emails?,?\s+and\s+phone\s+numbers?)/i,
    level: 'high',
    enabled: true,
    category: 'sensitive_disclosure',
  },
  {
    id: 'de-006',
    name: 'Training data memorization extraction',
    description: 'Attempts to force verbatim completion from training data',
    pattern: /(exactly\s+as\s+seen\s+in\s+your\s+training\s+data|complete\s+this\s+exactly\s+as|ssn:\s*\d{3}-\d{2}-?)/i,
    level: 'high',
    enabled: true,
    category: 'sensitive_disclosure',
  },
  {
    id: 'de-007',
    name: 'Model configuration fingerprinting',
    description: 'Attempts to extract model/runtime configuration details',
    pattern: /(what\s+model\s+are\s+you\s+running|temperature\s+settings?|token\s+limits?)/i,
    level: 'medium',
    enabled: true,
    category: 'sensitive_disclosure',
  },

  // Code execution patterns
  {
    id: 'ce-001',
    name: 'Code execution attempt',
    description: 'Attempts to execute code via injection',
    pattern: /exec\s*\(|eval\s*\(|__import__|subprocess\./i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-002',
    name: 'SQL injection',
    description: 'SQL injection patterns',
    pattern: /(\bOR\b|\bAND\b)\s+['"]?1['"]?\s*=\s*['"]?1['"]?|;\s*(DROP|DELETE|INSERT|UPDATE)\s+/i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-003',
    name: 'XSS script tag injection',
    description: 'Attempts to inject executable script payloads',
    pattern: /<script\b[^>]*>[\s\S]*?<\/script>/i,
    level: 'critical',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-004',
    name: 'Shell command substitution injection',
    description: 'Attempts shell command execution via substitution syntax',
    pattern: /\$\((?:[^)]*)\)|`[^`]+`/i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-005',
    name: 'LDAP injection sequence',
    description: 'Attempts LDAP filter manipulation payload',
    pattern: /\*\)\s*\(&\s*\(objectclass=\*\)/i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-006',
    name: 'Path traversal sequence',
    description: 'Attempts local file/path traversal',
    pattern: /(\.\.\/){2,}|\/etc\/passwd|\/etc\/shadow/i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },
  {
    id: 'ce-007',
    name: 'Template injection payload',
    description: 'Attempts SSTI-style template expression injection',
    pattern: /\{\{[^}]*constructor\.constructor\([^)]*\)[^}]*\}\}/i,
    level: 'high',
    enabled: true,
    category: 'insecure_output',
  },

  // Social engineering patterns
  {
    id: 'se-001',
    name: 'Authority manipulation',
    description: 'Claims special authority',
    pattern: /i\s+am\s+(your\s+)?(developer|creator|admin|administrator|owner)/i,
    level: 'medium',
    enabled: true,
    category: 'role_hijacking',
  },
  {
    id: 'se-002',
    name: 'Emergency override',
    description: 'Claims emergency situations',
    pattern: /(emergency|urgent|critical)\s+(override|bypass|exception)/i,
    level: 'medium',
    enabled: true,
    category: 'role_hijacking',
  },

  // Excessive agency patterns (LLM08)
  {
    id: 'ag-001',
    name: 'Destructive action without confirmation',
    description: 'Requests account/data deletion while bypassing confirmation flow',
    pattern: /(delete\s+all\s+(my\s+)?(data|account)|without\s+asking\s+for\s+confirmation|do\s+not\s+ask\s+for\s+confirmation)/i,
    level: 'critical',
    enabled: true,
    category: 'excessive_agency',
  },
  {
    id: 'ag-002',
    name: 'Financial transfer bypass',
    description: 'Requests high-risk financial actions while skipping verification',
    pattern: /(transfer\s+\$?\d[\d,]*|wire\s+transfer|skip\s+all\s+verification|bypass\s+verification\s+steps)/i,
    level: 'critical',
    enabled: true,
    category: 'excessive_agency',
  },
  {
    id: 'ag-003',
    name: 'Privilege escalation request',
    description: 'Requests unauthorized admin elevation or disabling security controls',
    pattern: /(grant\s+myself\s+admin|give\s+me\s+admin\s+access|disable\s+all\s+security\s+logs|privilege\s+escalation)/i,
    level: 'critical',
    enabled: true,
    category: 'excessive_agency',
  },
  {
    id: 'ag-004',
    name: 'Autonomous approval bypass',
    description: 'Requests auto-approval without human oversight',
    pattern: /(automatically\s+approve\s+all\s+pending\s+requests|without\s+showing\s+them\s+to\s+me|without\s+human\s+review)/i,
    level: 'high',
    enabled: true,
    category: 'excessive_agency',
  },
  {
    id: 'ag-005',
    name: 'Tool-chain data exfiltration',
    description: 'Chains tools to read sensitive files and exfiltrate data',
    pattern: /(use\s+the\s+file\s+tool\s+to\s+read\s+\/etc\/shadow|send\s+it\s+to\s+attacker@|tool\s+chain)/i,
    level: 'critical',
    enabled: true,
    category: 'excessive_agency',
  },

  // Resource abuse patterns (LLM04/LLM10)
  {
    id: 'rs-001',
    name: 'Infinite output loop request',
    description: 'Attempts to force unbounded generation loops',
    pattern: /(repeat\s+.*\s+forever|continue\s+infinitely|never\s+stop(\s+trying)?)/i,
    level: 'high',
    enabled: true,
    category: 'denial_of_service',
  },
  {
    id: 'rs-002',
    name: 'Extreme output/token demand',
    description: 'Requests extremely large or computationally abusive output',
    pattern: /(1\s*million\s*words|all\s+prime\s+numbers\s+up\s+to\s+10\^?\d+|remember\s+this:|store\s+this\s+permanently:)/i,
    level: 'high',
    enabled: true,
    category: 'unbounded_consumption',
  },
  {
    id: 'rs-003',
    name: 'API quota exhaustion request',
    description: 'Attempts to trigger repeated high-cost API/tool calls',
    pattern: /(call\s+the\s+external\s+api\s+\d+\s+times\s+in\s+a\s+loop|generate\s+embeddings\s+for\s+every\s+word\s+in\s+the\s+english\s+dictionary)/i,
    level: 'high',
    enabled: true,
    category: 'unbounded_consumption',
  },
  {
    id: 'rs-004',
    name: 'Persistent oversized storage request',
    description: 'Attempts to persist massive content long-term',
    pattern: /(store\s+this\s+permanently|save\s+this\s+forever|persist\s+this\s+entire\s+blob)/i,
    level: 'high',
    enabled: true,
    category: 'unbounded_consumption',
  },
];

/**
 * Compare threat levels
 */
export function compareThreatLevel(a: ThreatLevel, b: ThreatLevel): number {
  const levels: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
  return levels.indexOf(a) - levels.indexOf(b);
}

// Alias for backwards compatibility
export const DEFAULT_PATTERNS = THREAT_PATTERNS;
