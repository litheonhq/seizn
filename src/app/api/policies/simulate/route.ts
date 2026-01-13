/**
 * Seizn Policy Simulator - Simulation API
 *
 * POST /api/policies/simulate - Run a policy simulation
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  runSimulation,
  parsePolicy,
  parsePolicyJson,
  validatePolicy,
  SimulationError,
  PolicyParseError,
} from '@/lib/policy-simulator';
import type { SimulationConfig, PolicyRule } from '@/lib/policy-simulator';

// ============================================
// POST /api/policies/simulate - Run simulation
// ============================================

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;
    const body = await request.json();

    // Validate input
    const {
      base_policy_id,
      test_policy_id,
      test_policy_yaml,
      test_policy_json,
      query_ids,
      regression_set_id,
      inline_queries,
      max_queries,
    } = body as {
      base_policy_id?: string;
      test_policy_id?: string;
      test_policy_yaml?: string;
      test_policy_json?: unknown;
      query_ids?: string[];
      regression_set_id?: string;
      inline_queries?: string[];
      max_queries?: number;
    };

    // Must have either test_policy_id or test_policy content
    if (!test_policy_id && !test_policy_yaml && !test_policy_json) {
      return NextResponse.json(
        {
          error: 'Either test_policy_id, test_policy_yaml, or test_policy_json is required',
        },
        { status: 400 }
      );
    }

    // Parse inline test policy if provided
    let testPolicyRules: PolicyRule[] | undefined;
    if (test_policy_yaml || test_policy_json) {
      try {
        if (test_policy_yaml) {
          testPolicyRules = parsePolicy(test_policy_yaml);
        } else {
          testPolicyRules = parsePolicyJson(test_policy_json);
        }

        // Validate
        const validation = validatePolicy(testPolicyRules);
        if (!validation.valid) {
          return NextResponse.json(
            {
              error: 'Test policy validation failed',
              errors: validation.errors,
              warnings: validation.warnings,
            },
            { status: 400 }
          );
        }
      } catch (err) {
        const message = err instanceof PolicyParseError ? err.message : 'Invalid policy format';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // Plan-based limits
    const planLimits: Record<string, number> = {
      free: 10,
      starter: 50,
      pro: 200,
      enterprise: 1000,
    };
    const maxAllowed = planLimits[plan] || planLimits.free;
    const effectiveMaxQueries = Math.min(max_queries || maxAllowed, maxAllowed);

    // Build simulation config
    const config: SimulationConfig = {
      basePolicyId: base_policy_id,
      testPolicyId: test_policy_id,
      testPolicyRules,
      queryIds: query_ids,
      regressionSetId: regression_set_id,
      inlineQueries: inline_queries,
      maxQueries: effectiveMaxQueries,
      includeContent: true,
      calculateMetrics: true,
    };

    // Run simulation
    const result = await runSimulation(userId, config);

    return NextResponse.json({
      success: true,
      simulation_id: result.simulationId,
      status: result.status,
      summary: {
        total_queries: result.totalQueries,
        affected_queries: result.affectedQueries,
        blocked_chunks_count: result.blockedChunksCount,
        unblocked_chunks_count: result.unblockedChunksCount,
        masking_changed_count: result.maskingChangedCount,
        overall_impact_score: result.overallImpactScore,
        impact_level: getImpactLevel(result.overallImpactScore),
      },
      execution_time_ms: result.executionTimeMs,
    });
  } catch (err) {
    console.error('Simulation error:', err);

    if (err instanceof SimulationError) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// Helper Functions
// ============================================

function getImpactLevel(score: number): string {
  if (score === 0) return 'none';
  if (score < 0.1) return 'low';
  if (score < 0.3) return 'medium';
  if (score < 0.6) return 'high';
  return 'critical';
}
