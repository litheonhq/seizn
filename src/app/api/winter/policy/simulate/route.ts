/**
 * Winter Governance - Policy Simulation (Dry-Run) API
 *
 * POST /api/winter/policy/simulate - Simulate policy effects without applying
 *
 * This endpoint allows users to:
 * - Test policy configurations before deployment
 * - Preview what-if scenarios for policy changes
 * - Validate policy configurations
 * - See impact analysis on sample data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validatePolicyConfig,
  getDefaultPolicyConfig,
  getEffectivePolicy,
  type PolicyType,
  type PolicyConfig,
  type RetentionPolicyConfig,
  type PiiPolicyConfig,
  type AccessPolicyConfig,
  type AuditPolicyConfig,
  type SecurityPolicyConfig,
  type PolicyScope,
} from '@/lib/winter/org';
import { detectPII, maskPII, type PiiDetection } from '@/lib/winter/pii';

// ============================================
// Types
// ============================================

interface SimulateRequest {
  /** The type of policy to simulate */
  policy_type: PolicyType;
  /** Policy configuration to test */
  config: Partial<PolicyConfig>;
  /** Organization ID for context (optional - uses defaults if not provided) */
  organization_id?: string;
  /** Scope to test */
  scope?: PolicyScope;
  /** Test data for simulation */
  test_data?: TestData;
  /** What-if scenarios to analyze */
  scenarios?: WhatIfScenario[];
}

interface TestData {
  /** Sample text content for PII policy testing */
  text_samples?: string[];
  /** Sample records for retention policy testing */
  records?: TestRecord[];
  /** Sample user/session data for access policy testing */
  sessions?: TestSession[];
  /** Sample API calls for audit policy testing */
  api_calls?: TestApiCall[];
  /** Sample passwords for security policy testing */
  passwords?: string[];
  /** Sample API key info for security policy testing */
  api_keys?: TestApiKey[];
}

interface TestRecord {
  id: string;
  type: 'memories' | 'traces' | 'documents' | 'audit_logs';
  created_at: string;
  tags?: string[];
}

interface TestSession {
  user_id: string;
  ip_address?: string;
  session_count?: number;
  has_2fa?: boolean;
  domain?: string;
}

interface TestApiCall {
  endpoint: string;
  method: string;
  is_read?: boolean;
  is_write?: boolean;
  is_auth?: boolean;
  is_admin?: boolean;
}

interface TestApiKey {
  user_id: string;
  keys_count: number;
  oldest_key_age_days?: number;
}

interface WhatIfScenario {
  id: string;
  description: string;
  config_override: Partial<PolicyConfig>;
}

// ============================================
// Simulation Results
// ============================================

interface SimulationResult {
  /** Whether the policy configuration is valid */
  valid: boolean;
  /** Validation errors if any */
  validation_errors: string[];
  /** Detailed simulation results */
  results: PolicySimulationResults;
  /** What-if scenario analysis */
  scenarios?: ScenarioResult[];
  /** Summary of the simulation */
  summary: SimulationSummary;
  /** Merged configuration (defaults + provided) */
  merged_config: PolicyConfig;
}

interface PolicySimulationResults {
  pii?: PiiSimulationResult;
  retention?: RetentionSimulationResult;
  access?: AccessSimulationResult;
  audit?: AuditSimulationResult;
  security?: SecuritySimulationResult;
}

interface PiiSimulationResult {
  /** Per-sample results */
  samples: Array<{
    input: string;
    detections: PiiDetection[];
    action_taken: 'allow' | 'mask' | 'deny' | 'encrypt';
    output: string | null;
    would_block: boolean;
  }>;
  /** Aggregated statistics */
  stats: {
    total_samples: number;
    samples_with_pii: number;
    total_pii_detected: number;
    pii_by_type: Record<string, number>;
    samples_blocked: number;
    samples_masked: number;
    samples_allowed: number;
  };
}

interface RetentionSimulationResult {
  records: Array<{
    id: string;
    type: string;
    age_days: number;
    would_delete: boolean;
    in_grace_period: boolean;
    exempt: boolean;
    reason?: string;
  }>;
  stats: {
    total_records: number;
    would_delete: number;
    in_grace_period: number;
    exempt: number;
    retained: number;
  };
}

interface AccessSimulationResult {
  sessions: Array<{
    user_id: string;
    ip_allowed: boolean;
    ip_denied: boolean;
    meets_2fa_requirement: boolean;
    within_session_limit: boolean;
    domain_allowed: boolean;
    overall_allowed: boolean;
    denial_reasons: string[];
  }>;
  stats: {
    total_sessions: number;
    allowed: number;
    denied: number;
    denied_by_ip: number;
    denied_by_2fa: number;
    denied_by_session_limit: number;
    denied_by_domain: number;
  };
}

interface AuditSimulationResult {
  api_calls: Array<{
    endpoint: string;
    method: string;
    would_log: boolean;
    log_reasons: string[];
  }>;
  stats: {
    total_calls: number;
    would_log: number;
    would_skip: number;
    log_retention_days: number;
  };
}

interface SecuritySimulationResult {
  passwords?: Array<{
    password: string;
    valid: boolean;
    issues: string[];
  }>;
  api_keys?: Array<{
    user_id: string;
    within_limit: boolean;
    needs_rotation: boolean;
    issues: string[];
  }>;
  stats: {
    passwords_tested: number;
    passwords_valid: number;
    passwords_invalid: number;
    api_keys_tested: number;
    api_keys_compliant: number;
    api_keys_non_compliant: number;
  };
}

interface ScenarioResult {
  id: string;
  description: string;
  config: PolicyConfig;
  results: PolicySimulationResults;
  comparison?: {
    baseline_vs_scenario: string;
    impact_summary: string;
  };
}

interface SimulationSummary {
  policy_type: PolicyType;
  is_valid: boolean;
  test_data_provided: boolean;
  scenarios_analyzed: number;
  key_findings: string[];
  recommendations: string[];
}

// ============================================
// Helper Functions
// ============================================

async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function simulatePiiPolicy(
  config: PiiPolicyConfig,
  testData: TestData
): PiiSimulationResult {
  const samples = testData.text_samples || [];
  const results: PiiSimulationResult['samples'] = [];

  const stats = {
    total_samples: samples.length,
    samples_with_pii: 0,
    total_pii_detected: 0,
    pii_by_type: {} as Record<string, number>,
    samples_blocked: 0,
    samples_masked: 0,
    samples_allowed: 0,
  };

  for (const sample of samples) {
    const detections = detectPII(sample);
    const hasPii = detections.length > 0;

    if (hasPii) {
      stats.samples_with_pii++;
      stats.total_pii_detected += detections.length;

      for (const d of detections) {
        stats.pii_by_type[d.type] = (stats.pii_by_type[d.type] || 0) + 1;
      }
    }

    // Determine action based on config
    let action: 'allow' | 'mask' | 'deny' | 'encrypt' = config.default_action;

    // Check for type-specific overrides
    if (hasPii && config.type_actions) {
      const detectedTypes = [...new Set(detections.map((d) => d.type))];
      for (const type of detectedTypes) {
        if (config.type_actions[type]) {
          // Use the most restrictive action
          const typeAction = config.type_actions[type];
          if (typeAction === 'deny') action = 'deny';
          else if (typeAction === 'encrypt' && action !== 'deny') action = 'encrypt';
          else if (typeAction === 'mask' && action === 'allow') action = 'mask';
        }
      }
    }

    // If no PII, always allow
    if (!hasPii) {
      action = 'allow';
    }

    let output: string | null = sample;
    let would_block = false;

    switch (action) {
      case 'deny':
        output = null;
        would_block = true;
        stats.samples_blocked++;
        break;
      case 'mask':
        output = maskPII(sample).maskedText;
        stats.samples_masked++;
        break;
      case 'encrypt':
        output = '[ENCRYPTED]';
        stats.samples_allowed++;
        break;
      case 'allow':
      default:
        stats.samples_allowed++;
        break;
    }

    results.push({
      input: sample,
      detections,
      action_taken: action,
      output,
      would_block,
    });
  }

  return { samples: results, stats };
}

function simulateRetentionPolicy(
  config: RetentionPolicyConfig,
  testData: TestData
): RetentionSimulationResult {
  const records = testData.records || [];
  const now = new Date();
  const results: RetentionSimulationResult['records'] = [];

  const stats = {
    total_records: records.length,
    would_delete: 0,
    in_grace_period: 0,
    exempt: 0,
    retained: 0,
  };

  for (const record of records) {
    const createdAt = new Date(record.created_at);
    const ageDays = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if record type is covered by policy
    const isCoveredType = config.data_types.includes(
      record.type as 'memories' | 'traces' | 'documents' | 'audit_logs'
    );

    // Check if record is exempt
    const isExempt =
      record.tags?.some((tag) => config.exempt_tags?.includes(tag)) || false;

    // Calculate retention status
    const pastRetention = ageDays > config.retention_days;
    const inGracePeriod =
      pastRetention && ageDays <= config.retention_days + config.grace_period_days;
    const wouldDelete = isCoveredType && !isExempt && pastRetention && !inGracePeriod;

    let reason: string | undefined;
    if (!isCoveredType) {
      reason = `Record type '${record.type}' not covered by policy`;
      stats.retained++;
    } else if (isExempt) {
      reason = `Record exempt due to tags: ${record.tags?.join(', ')}`;
      stats.exempt++;
    } else if (inGracePeriod) {
      reason = `In grace period (${config.grace_period_days} days remaining)`;
      stats.in_grace_period++;
    } else if (wouldDelete) {
      reason = `Past retention period of ${config.retention_days} days`;
      stats.would_delete++;
    } else {
      reason = `Within retention period`;
      stats.retained++;
    }

    results.push({
      id: record.id,
      type: record.type,
      age_days: ageDays,
      would_delete: wouldDelete,
      in_grace_period: inGracePeriod,
      exempt: isExempt,
      reason,
    });
  }

  return { records: results, stats };
}

function simulateAccessPolicy(
  config: AccessPolicyConfig,
  testData: TestData
): AccessSimulationResult {
  const sessions = testData.sessions || [];
  const results: AccessSimulationResult['sessions'] = [];

  const stats = {
    total_sessions: sessions.length,
    allowed: 0,
    denied: 0,
    denied_by_ip: 0,
    denied_by_2fa: 0,
    denied_by_session_limit: 0,
    denied_by_domain: 0,
  };

  for (const session of sessions) {
    const denialReasons: string[] = [];

    // IP allowlist check
    let ipAllowed = true;
    let ipDenied = false;

    if (config.ip_allowlist?.length && session.ip_address) {
      ipAllowed = config.ip_allowlist.includes(session.ip_address);
      if (!ipAllowed) {
        denialReasons.push(`IP ${session.ip_address} not in allowlist`);
      }
    }

    if (config.ip_denylist?.length && session.ip_address) {
      ipDenied = config.ip_denylist.includes(session.ip_address);
      if (ipDenied) {
        denialReasons.push(`IP ${session.ip_address} in denylist`);
      }
    }

    // 2FA check
    const meets2fa = !config.require_2fa || session.has_2fa === true;
    if (!meets2fa) {
      denialReasons.push('2FA required but not enabled');
    }

    // Session limit check
    const withinSessionLimit =
      (session.session_count || 1) <= config.max_sessions;
    if (!withinSessionLimit) {
      denialReasons.push(
        `Session count ${session.session_count} exceeds limit of ${config.max_sessions}`
      );
    }

    // Domain check
    let domainAllowed = true;
    if (config.allowed_domains?.length && session.domain) {
      domainAllowed = config.allowed_domains.some(
        (d) => session.domain === d || session.domain?.endsWith(`.${d}`)
      );
      if (!domainAllowed) {
        denialReasons.push(`Domain ${session.domain} not in allowed list`);
      }
    }

    const overallAllowed =
      ipAllowed && !ipDenied && meets2fa && withinSessionLimit && domainAllowed;

    if (overallAllowed) {
      stats.allowed++;
    } else {
      stats.denied++;
      if (!ipAllowed || ipDenied) stats.denied_by_ip++;
      if (!meets2fa) stats.denied_by_2fa++;
      if (!withinSessionLimit) stats.denied_by_session_limit++;
      if (!domainAllowed) stats.denied_by_domain++;
    }

    results.push({
      user_id: session.user_id,
      ip_allowed: ipAllowed,
      ip_denied: ipDenied,
      meets_2fa_requirement: meets2fa,
      within_session_limit: withinSessionLimit,
      domain_allowed: domainAllowed,
      overall_allowed: overallAllowed,
      denial_reasons: denialReasons,
    });
  }

  return { sessions: results, stats };
}

function simulateAuditPolicy(
  config: AuditPolicyConfig,
  testData: TestData
): AuditSimulationResult {
  const apiCalls = testData.api_calls || [];
  const results: AuditSimulationResult['api_calls'] = [];

  const stats = {
    total_calls: apiCalls.length,
    would_log: 0,
    would_skip: 0,
    log_retention_days: config.log_retention_days,
  };

  for (const call of apiCalls) {
    const logReasons: string[] = [];

    // Check logging conditions
    if (config.log_all_api_calls) {
      logReasons.push('log_all_api_calls enabled');
    }
    if (config.log_reads && call.is_read) {
      logReasons.push('Read operation logged');
    }
    if (config.log_writes && call.is_write) {
      logReasons.push('Write operation logged');
    }
    if (config.log_auth_events && call.is_auth) {
      logReasons.push('Auth event logged');
    }
    if (config.log_admin_actions && call.is_admin) {
      logReasons.push('Admin action logged');
    }

    const wouldLog = logReasons.length > 0;

    if (wouldLog) {
      stats.would_log++;
    } else {
      stats.would_skip++;
    }

    results.push({
      endpoint: call.endpoint,
      method: call.method,
      would_log: wouldLog,
      log_reasons: logReasons,
    });
  }

  return { api_calls: results, stats };
}

function simulateSecurityPolicy(
  config: SecurityPolicyConfig,
  testData: TestData
): SecuritySimulationResult {
  const passwords = testData.passwords || [];
  const apiKeys = testData.api_keys || [];

  const passwordResults: SecuritySimulationResult['passwords'] = [];
  const apiKeyResults: SecuritySimulationResult['api_keys'] = [];

  const stats = {
    passwords_tested: passwords.length,
    passwords_valid: 0,
    passwords_invalid: 0,
    api_keys_tested: apiKeys.length,
    api_keys_compliant: 0,
    api_keys_non_compliant: 0,
  };

  // Validate passwords
  for (const password of passwords) {
    const issues: string[] = [];

    if (password.length < config.password_policy.min_length) {
      issues.push(
        `Password too short (min: ${config.password_policy.min_length})`
      );
    }
    if (config.password_policy.require_uppercase && !/[A-Z]/.test(password)) {
      issues.push('Missing uppercase letter');
    }
    if (config.password_policy.require_lowercase && !/[a-z]/.test(password)) {
      issues.push('Missing lowercase letter');
    }
    if (config.password_policy.require_numbers && !/\d/.test(password)) {
      issues.push('Missing number');
    }
    if (
      config.password_policy.require_special &&
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      issues.push('Missing special character');
    }

    const valid = issues.length === 0;
    if (valid) {
      stats.passwords_valid++;
    } else {
      stats.passwords_invalid++;
    }

    passwordResults.push({
      password: password.slice(0, 2) + '*'.repeat(password.length - 2), // Mask password
      valid,
      issues,
    });
  }

  // Validate API keys
  for (const keyInfo of apiKeys) {
    const issues: string[] = [];

    if (keyInfo.keys_count > config.api_key_policy.max_keys_per_user) {
      issues.push(
        `Exceeds max keys per user (${keyInfo.keys_count} > ${config.api_key_policy.max_keys_per_user})`
      );
    }

    if (
      config.api_key_policy.require_rotation &&
      config.api_key_policy.max_age_days &&
      keyInfo.oldest_key_age_days !== undefined &&
      keyInfo.oldest_key_age_days > config.api_key_policy.max_age_days
    ) {
      issues.push(
        `Key rotation required (oldest: ${keyInfo.oldest_key_age_days} days > max: ${config.api_key_policy.max_age_days})`
      );
    }

    const compliant = issues.length === 0;
    const needsRotation =
      config.api_key_policy.require_rotation &&
      config.api_key_policy.max_age_days !== undefined &&
      keyInfo.oldest_key_age_days !== undefined &&
      keyInfo.oldest_key_age_days > config.api_key_policy.max_age_days;

    if (compliant) {
      stats.api_keys_compliant++;
    } else {
      stats.api_keys_non_compliant++;
    }

    apiKeyResults.push({
      user_id: keyInfo.user_id,
      within_limit: keyInfo.keys_count <= config.api_key_policy.max_keys_per_user,
      needs_rotation: needsRotation,
      issues,
    });
  }

  return {
    passwords: passwordResults.length > 0 ? passwordResults : undefined,
    api_keys: apiKeyResults.length > 0 ? apiKeyResults : undefined,
    stats,
  };
}

function generateSummary(
  policyType: PolicyType,
  isValid: boolean,
  hasTestData: boolean,
  scenarioCount: number,
  results: PolicySimulationResults
): SimulationSummary {
  const keyFindings: string[] = [];
  const recommendations: string[] = [];

  // Generate findings and recommendations based on results
  switch (policyType) {
    case 'pii_policy':
      if (results.pii) {
        const { stats } = results.pii;
        if (stats.samples_with_pii > 0) {
          keyFindings.push(
            `${stats.samples_with_pii}/${stats.total_samples} samples contain PII`
          );
          keyFindings.push(
            `${stats.total_pii_detected} PII instances detected across all samples`
          );
        }
        if (stats.samples_blocked > 0) {
          keyFindings.push(
            `${stats.samples_blocked} samples would be blocked`
          );
        }
        if (stats.pii_by_type['email'] > 0) {
          recommendations.push(
            'Consider masking emails instead of blocking to preserve context'
          );
        }
      }
      break;

    case 'retention_policy':
      if (results.retention) {
        const { stats } = results.retention;
        if (stats.would_delete > 0) {
          keyFindings.push(
            `${stats.would_delete}/${stats.total_records} records would be deleted`
          );
        }
        if (stats.in_grace_period > 0) {
          keyFindings.push(
            `${stats.in_grace_period} records in grace period`
          );
        }
        if (stats.exempt > 0) {
          keyFindings.push(`${stats.exempt} records exempt from deletion`);
        }
        if (stats.would_delete > stats.total_records * 0.5) {
          recommendations.push(
            'More than 50% of records would be deleted. Consider increasing retention period.'
          );
        }
      }
      break;

    case 'access_policy':
      if (results.access) {
        const { stats } = results.access;
        keyFindings.push(
          `${stats.allowed}/${stats.total_sessions} sessions would be allowed`
        );
        if (stats.denied > 0) {
          keyFindings.push(`${stats.denied} sessions would be denied`);
          if (stats.denied_by_2fa > 0) {
            keyFindings.push(
              `${stats.denied_by_2fa} denied due to missing 2FA`
            );
          }
        }
        if (stats.denied_by_2fa > stats.total_sessions * 0.3) {
          recommendations.push(
            'Many users lack 2FA. Consider phased 2FA rollout.'
          );
        }
      }
      break;

    case 'audit_policy':
      if (results.audit) {
        const { stats } = results.audit;
        keyFindings.push(
          `${stats.would_log}/${stats.total_calls} API calls would be logged`
        );
        keyFindings.push(`Logs retained for ${stats.log_retention_days} days`);
        if (stats.would_log === stats.total_calls) {
          recommendations.push(
            'All calls logged - consider disabling log_reads to reduce volume'
          );
        }
      }
      break;

    case 'security_policy':
      if (results.security) {
        const { stats } = results.security;
        if (stats.passwords_tested > 0) {
          keyFindings.push(
            `${stats.passwords_valid}/${stats.passwords_tested} passwords meet requirements`
          );
        }
        if (stats.api_keys_tested > 0) {
          keyFindings.push(
            `${stats.api_keys_compliant}/${stats.api_keys_tested} API key configurations compliant`
          );
        }
        if (stats.passwords_invalid > 0) {
          recommendations.push(
            'Some passwords do not meet requirements. Enforce password update on login.'
          );
        }
      }
      break;
  }

  if (!hasTestData) {
    recommendations.push(
      'Provide test_data for more detailed simulation results'
    );
  }

  return {
    policy_type: policyType,
    is_valid: isValid,
    test_data_provided: hasTestData,
    scenarios_analyzed: scenarioCount,
    key_findings: keyFindings,
    recommendations,
  };
}

function runSimulation(
  policyType: PolicyType,
  config: PolicyConfig,
  testData: TestData
): PolicySimulationResults {
  const results: PolicySimulationResults = {};

  switch (policyType) {
    case 'pii_policy':
      results.pii = simulatePiiPolicy(config as PiiPolicyConfig, testData);
      break;
    case 'retention_policy':
      results.retention = simulateRetentionPolicy(
        config as RetentionPolicyConfig,
        testData
      );
      break;
    case 'access_policy':
      results.access = simulateAccessPolicy(
        config as AccessPolicyConfig,
        testData
      );
      break;
    case 'audit_policy':
      results.audit = simulateAuditPolicy(
        config as AuditPolicyConfig,
        testData
      );
      break;
    case 'security_policy':
      results.security = simulateSecurityPolicy(
        config as SecurityPolicyConfig,
        testData
      );
      break;
  }

  return results;
}

// ============================================
// API Handler
// ============================================

/**
 * POST /api/winter/policy/simulate
 * Simulate policy effects without applying changes
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: SimulateRequest = await request.json();
    const {
      policy_type,
      config,
      organization_id,
      test_data = {},
      scenarios = [],
    } = body;

    // Validate policy type
    const validTypes: PolicyType[] = [
      'retention_policy',
      'pii_policy',
      'access_policy',
      'audit_policy',
      'security_policy',
    ];

    if (!policy_type) {
      return NextResponse.json(
        { error: 'policy_type is required' },
        { status: 400 }
      );
    }

    if (!validTypes.includes(policy_type)) {
      return NextResponse.json(
        { error: `Invalid policy type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Get default config and merge with provided config
    const defaultConfig = getDefaultPolicyConfig(policy_type);
    const mergedConfig = {
      ...defaultConfig,
      ...(config || {}),
    } as PolicyConfig;

    // Validate the merged configuration
    const validation = validatePolicyConfig(policy_type, mergedConfig);

    // If organization_id provided, get current effective policy for comparison
    let currentPolicy: PolicyConfig | null = null;
    if (organization_id) {
      try {
        currentPolicy = await getEffectivePolicy(organization_id, policy_type);
      } catch {
        // Ignore errors - org may not have policies yet
      }
    }

    // Run simulation with test data
    const hasTestData =
      Object.values(test_data).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      );
    const results = runSimulation(policy_type, mergedConfig, test_data);

    // Run what-if scenarios
    const scenarioResults: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      const scenarioConfig = {
        ...mergedConfig,
        ...scenario.config_override,
      } as PolicyConfig;

      const scenarioSimulation = runSimulation(
        policy_type,
        scenarioConfig,
        test_data
      );

      scenarioResults.push({
        id: scenario.id,
        description: scenario.description,
        config: scenarioConfig,
        results: scenarioSimulation,
        comparison: {
          baseline_vs_scenario: `Comparing baseline config with scenario: ${scenario.description}`,
          impact_summary: generateImpactSummary(
            policy_type,
            results,
            scenarioSimulation
          ),
        },
      });
    }

    // Generate summary
    const summary = generateSummary(
      policy_type,
      validation.valid,
      hasTestData,
      scenarios.length,
      results
    );

    // Build response
    const response: SimulationResult = {
      valid: validation.valid,
      validation_errors: validation.errors,
      results,
      merged_config: mergedConfig,
      summary,
      ...(scenarioResults.length > 0 && { scenarios: scenarioResults }),
    };

    // Add current policy comparison if available
    if (currentPolicy) {
      (response as SimulationResult & { current_policy?: PolicyConfig }).current_policy =
        currentPolicy;
    }

    return NextResponse.json({
      success: true,
      simulation: response,
    });
  } catch (error) {
    console.error('[WinterPolicy Simulate] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateImpactSummary(
  policyType: PolicyType,
  baseline: PolicySimulationResults,
  scenario: PolicySimulationResults
): string {
  switch (policyType) {
    case 'pii_policy':
      if (baseline.pii && scenario.pii) {
        const baseBlocked = baseline.pii.stats.samples_blocked;
        const scenarioBlocked = scenario.pii.stats.samples_blocked;
        const diff = scenarioBlocked - baseBlocked;
        if (diff > 0) return `${diff} more samples would be blocked`;
        if (diff < 0) return `${Math.abs(diff)} fewer samples would be blocked`;
        return 'No change in blocked samples';
      }
      break;
    case 'retention_policy':
      if (baseline.retention && scenario.retention) {
        const baseDelete = baseline.retention.stats.would_delete;
        const scenarioDelete = scenario.retention.stats.would_delete;
        const diff = scenarioDelete - baseDelete;
        if (diff > 0) return `${diff} more records would be deleted`;
        if (diff < 0) return `${Math.abs(diff)} fewer records would be deleted`;
        return 'No change in deletion count';
      }
      break;
    case 'access_policy':
      if (baseline.access && scenario.access) {
        const baseDenied = baseline.access.stats.denied;
        const scenarioDenied = scenario.access.stats.denied;
        const diff = scenarioDenied - baseDenied;
        if (diff > 0) return `${diff} more sessions would be denied`;
        if (diff < 0) return `${Math.abs(diff)} fewer sessions would be denied`;
        return 'No change in denied sessions';
      }
      break;
    case 'audit_policy':
      if (baseline.audit && scenario.audit) {
        const baseLog = baseline.audit.stats.would_log;
        const scenarioLog = scenario.audit.stats.would_log;
        const diff = scenarioLog - baseLog;
        if (diff > 0) return `${diff} more API calls would be logged`;
        if (diff < 0) return `${Math.abs(diff)} fewer API calls would be logged`;
        return 'No change in logged calls';
      }
      break;
    case 'security_policy':
      if (baseline.security && scenario.security) {
        const baseInvalid = baseline.security.stats.passwords_invalid;
        const scenarioInvalid = scenario.security.stats.passwords_invalid;
        const diff = scenarioInvalid - baseInvalid;
        if (diff > 0)
          return `${diff} more passwords would fail validation`;
        if (diff < 0)
          return `${Math.abs(diff)} fewer passwords would fail validation`;
        return 'No change in password validation';
      }
      break;
  }
  return 'Unable to compare scenarios';
}

/**
 * GET /api/winter/policy/simulate
 * Get simulation endpoint info and example payloads
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    endpoint: '/api/winter/policy/simulate',
    method: 'POST',
    description:
      'Simulate policy effects without applying changes. Supports what-if analysis.',
    supported_policy_types: [
      'retention_policy',
      'pii_policy',
      'access_policy',
      'audit_policy',
      'security_policy',
    ],
    example_payload: {
      policy_type: 'pii_policy',
      config: {
        default_action: 'mask',
        auto_detect: true,
        notify_on_detection: true,
      },
      test_data: {
        text_samples: [
          'Contact john@example.com for details',
          'Call 010-1234-5678',
          'No PII in this message',
        ],
      },
      scenarios: [
        {
          id: 'strict_mode',
          description: 'What if we deny all PII?',
          config_override: {
            default_action: 'deny',
          },
        },
      ],
    },
    test_data_formats: {
      pii_policy: {
        text_samples: ['Array of text strings to test for PII'],
      },
      retention_policy: {
        records: [
          {
            id: 'string',
            type: 'memories | traces | documents | audit_logs',
            created_at: 'ISO date string',
            tags: ['optional', 'tags'],
          },
        ],
      },
      access_policy: {
        sessions: [
          {
            user_id: 'string',
            ip_address: 'optional IP',
            session_count: 'optional number',
            has_2fa: 'optional boolean',
            domain: 'optional domain',
          },
        ],
      },
      audit_policy: {
        api_calls: [
          {
            endpoint: '/api/memories',
            method: 'GET',
            is_read: true,
            is_write: false,
            is_auth: false,
            is_admin: false,
          },
        ],
      },
      security_policy: {
        passwords: ['Array of passwords to validate'],
        api_keys: [
          {
            user_id: 'string',
            keys_count: 'number',
            oldest_key_age_days: 'optional number',
          },
        ],
      },
    },
  });
}
