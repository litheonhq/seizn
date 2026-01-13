/**
 * Seizn Policy Simulator - Policy Validation API
 *
 * POST /api/policies/validate - Validate a policy without saving
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  parsePolicy,
  parsePolicyJson,
  validatePolicy,
  serializeToYaml,
  serializeToJson,
  PolicyParseError,
} from '@/lib/policy-simulator';

// ============================================
// POST /api/policies/validate
// ============================================

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const body = await request.json();
    const { policy_yaml, policy_json } = body as {
      policy_yaml?: string;
      policy_json?: unknown;
    };

    if (!policy_yaml && !policy_json) {
      return NextResponse.json(
        { error: 'Either policy_yaml or policy_json is required' },
        { status: 400 }
      );
    }

    // Parse the policy
    let rules;
    let parseError: string | null = null;

    try {
      if (policy_yaml) {
        rules = parsePolicy(policy_yaml);
      } else {
        rules = parsePolicyJson(policy_json);
      }
    } catch (err) {
      parseError = err instanceof PolicyParseError ? err.message : 'Invalid policy format';
    }

    // If parsing failed, return early
    if (parseError || !rules) {
      return NextResponse.json({
        valid: false,
        parseError,
        errors: [{ path: 'policy', message: parseError || 'Parse failed', code: 'PARSE_ERROR' }],
        warnings: [],
      });
    }

    // Validate the parsed rules
    const validation = validatePolicy(rules);

    // Generate normalized output
    const normalized = {
      yaml: serializeToYaml(rules),
      json: serializeToJson(rules),
    };

    // Count rules by type
    const ruleStats = {
      total: rules.length,
      byType: rules.reduce((acc, rule) => {
        acc[rule.type] = (acc[rule.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byAction: rules.reduce((acc, rule) => {
        acc[rule.action] = (acc[rule.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      normalized,
      stats: ruleStats,
    });
  } catch (err) {
    console.error('Validate policy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
