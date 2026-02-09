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
