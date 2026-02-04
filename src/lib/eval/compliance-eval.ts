/**
 * Compliance Evaluation Module
 *
 * Validates policies against compliance requirements including:
 * - OWASP LLM Top 10 coverage
 * - GDPR/CCPA data handling
 * - SOC 2 control requirements
 * - Custom organization policies
 */

import type { EvalTestResult, EvalSeverity } from './types';

interface ComplianceRequirement {
  id: string;
  name: string;
  framework: 'owasp_llm' | 'gdpr' | 'ccpa' | 'soc2' | 'custom';
  severity: EvalSeverity;
  check: (metadata: Record<string, unknown>) => Promise<{
    passed: boolean;
    message: string;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Run compliance checks based on trigger metadata
 */
export async function runComplianceCheck(
  metadata: Record<string, unknown>
): Promise<EvalTestResult[]> {
  const results: EvalTestResult[] = [];

  // Determine which compliance frameworks apply
  const frameworks = determineApplicableFrameworks(metadata);

  for (const framework of frameworks) {
    const requirements = getFrameworkRequirements(framework);

    for (const requirement of requirements) {
      const startTime = Date.now();

      try {
        const checkResult = await requirement.check(metadata);

        results.push({
          testId: requirement.id,
          testName: requirement.name,
          suite: 'compliance',
          status: checkResult.passed ? 'passed' : 'failed',
          severity: requirement.severity,
          message: checkResult.message,
          details: {
            framework: requirement.framework,
            ...checkResult.details,
          },
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          testId: requirement.id,
          testName: requirement.name,
          suite: 'compliance',
          status: 'error',
          severity: requirement.severity,
          message: error instanceof Error ? error.message : 'Check failed',
          durationMs: Date.now() - startTime,
        });
      }
    }
  }

  return results;
}

// ============================================
// Framework Determination
// ============================================

function determineApplicableFrameworks(
  metadata: Record<string, unknown>
): string[] {
  const frameworks: string[] = ['owasp_llm']; // Always check OWASP

  // Check organization settings for additional frameworks
  const orgSettings = metadata.organizationSettings as Record<string, unknown> | undefined;

  if (orgSettings?.gdprEnabled) {
    frameworks.push('gdpr');
  }

  if (orgSettings?.ccpaEnabled) {
    frameworks.push('ccpa');
  }

  if (orgSettings?.soc2Enabled) {
    frameworks.push('soc2');
  }

  return frameworks;
}

// ============================================
// Framework Requirements
// ============================================

function getFrameworkRequirements(framework: string): ComplianceRequirement[] {
  switch (framework) {
    case 'owasp_llm':
      return OWASP_LLM_REQUIREMENTS;
    case 'gdpr':
      return GDPR_REQUIREMENTS;
    case 'soc2':
      return SOC2_REQUIREMENTS;
    default:
      return [];
  }
}

// OWASP LLM Top 10 Requirements
const OWASP_LLM_REQUIREMENTS: ComplianceRequirement[] = [
  {
    id: 'owasp-llm01',
    name: 'LLM01: Prompt Injection Protection',
    framework: 'owasp_llm',
    severity: 'critical',
    check: async (metadata) => {
      // Check if prompt injection patterns are enabled
      const hasPromptInjectionPatterns = await checkPatternsEnabled([
        'jailbreak',
        'instruction_override',
        'role_hijacking',
      ]);

      return {
        passed: hasPromptInjectionPatterns,
        message: hasPromptInjectionPatterns
          ? 'Prompt injection protection patterns are enabled'
          : 'Missing prompt injection protection patterns',
        details: { categories: ['jailbreak', 'instruction_override', 'role_hijacking'] },
      };
    },
  },
  {
    id: 'owasp-llm02',
    name: 'LLM02: Insecure Output Handling',
    framework: 'owasp_llm',
    severity: 'high',
    check: async () => {
      const hasOutputPatterns = await checkPatternsEnabled(['insecure_output']);

      return {
        passed: hasOutputPatterns,
        message: hasOutputPatterns
          ? 'Insecure output handling patterns are enabled'
          : 'Missing insecure output handling protection',
      };
    },
  },
  {
    id: 'owasp-llm06',
    name: 'LLM06: Sensitive Information Disclosure',
    framework: 'owasp_llm',
    severity: 'high',
    check: async () => {
      const hasDisclosurePatterns = await checkPatternsEnabled([
        'data_exfiltration',
        'sensitive_disclosure',
      ]);

      return {
        passed: hasDisclosurePatterns,
        message: hasDisclosurePatterns
          ? 'Sensitive information disclosure protection is enabled'
          : 'Missing sensitive information disclosure protection',
      };
    },
  },
  {
    id: 'owasp-llm08',
    name: 'LLM08: Excessive Agency Prevention',
    framework: 'owasp_llm',
    severity: 'critical',
    check: async () => {
      const hasAgencyPatterns = await checkPatternsEnabled(['excessive_agency']);

      return {
        passed: hasAgencyPatterns,
        message: hasAgencyPatterns
          ? 'Excessive agency prevention patterns are enabled'
          : 'Missing excessive agency prevention',
      };
    },
  },
  {
    id: 'owasp-llm10',
    name: 'LLM10: Unbounded Consumption Protection',
    framework: 'owasp_llm',
    severity: 'medium',
    check: async () => {
      const hasConsumptionPatterns = await checkPatternsEnabled([
        'denial_of_service',
        'unbounded_consumption',
      ]);

      return {
        passed: hasConsumptionPatterns,
        message: hasConsumptionPatterns
          ? 'Unbounded consumption protection is enabled'
          : 'Missing unbounded consumption protection',
      };
    },
  },
];

// GDPR Requirements
const GDPR_REQUIREMENTS: ComplianceRequirement[] = [
  {
    id: 'gdpr-pii-detection',
    name: 'GDPR: PII Detection Enabled',
    framework: 'gdpr',
    severity: 'high',
    check: async () => {
      const hasPIIPatterns = await checkPatternsEnabled(['sensitive_disclosure']);

      return {
        passed: hasPIIPatterns,
        message: hasPIIPatterns
          ? 'PII detection patterns are enabled'
          : 'PII detection patterns are not enabled',
      };
    },
  },
  {
    id: 'gdpr-data-minimization',
    name: 'GDPR: Data Minimization Policy',
    framework: 'gdpr',
    severity: 'medium',
    check: async (metadata) => {
      // Check if data minimization is configured
      const config = metadata.policyConfig as Record<string, unknown> | undefined;
      const hasMinimization = config?.dataMinimization === true;

      return {
        passed: hasMinimization,
        message: hasMinimization
          ? 'Data minimization policy is configured'
          : 'Data minimization policy not found',
      };
    },
  },
  {
    id: 'gdpr-logging',
    name: 'GDPR: Audit Logging Enabled',
    framework: 'gdpr',
    severity: 'high',
    check: async (metadata) => {
      const config = metadata.policyConfig as Record<string, unknown> | undefined;
      const loggingEnabled = config?.logDetections !== false;

      return {
        passed: loggingEnabled,
        message: loggingEnabled
          ? 'Audit logging is enabled'
          : 'Audit logging is disabled - GDPR requires activity logging',
      };
    },
  },
];

// SOC 2 Requirements
const SOC2_REQUIREMENTS: ComplianceRequirement[] = [
  {
    id: 'soc2-access-control',
    name: 'SOC 2: Access Control Monitoring',
    framework: 'soc2',
    severity: 'high',
    check: async () => {
      const hasAccessPatterns = await checkPatternsEnabled([
        'role_hijacking',
        'excessive_agency',
      ]);

      return {
        passed: hasAccessPatterns,
        message: hasAccessPatterns
          ? 'Access control monitoring is enabled'
          : 'Missing access control monitoring patterns',
      };
    },
  },
  {
    id: 'soc2-critical-alerts',
    name: 'SOC 2: Critical Alert Configuration',
    framework: 'soc2',
    severity: 'medium',
    check: async (metadata) => {
      const config = metadata.policyConfig as Record<string, unknown> | undefined;
      const alertsEnabled = config?.alertOnCritical === true;

      return {
        passed: alertsEnabled,
        message: alertsEnabled
          ? 'Critical alerts are configured'
          : 'Critical alerts should be enabled for SOC 2 compliance',
      };
    },
  },
];

// ============================================
// Helpers
// ============================================

async function checkPatternsEnabled(categories: string[]): Promise<boolean> {
  try {
    const { THREAT_PATTERNS } = await import('@/lib/prompt-firewall/patterns');

    for (const category of categories) {
      const hasEnabled = THREAT_PATTERNS.some(
        (p) => p.category === category && p.enabled
      );
      if (!hasEnabled) {
        return false;
      }
    }

    return true;
  } catch {
    // If we can't load patterns, assume not enabled
    return false;
  }
}
