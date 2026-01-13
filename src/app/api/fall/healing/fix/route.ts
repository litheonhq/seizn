/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { validateContract } from '@/lib/fall/contracts';
import { AutoHealer, analyzeFailures, executeHealingPlan } from '@/lib/fall/healing';
import type { Contract, ContractRow, ValidationResult } from '@/lib/fall/contracts';
import type {
  HealingRule,
  HealingRuleRow,
  HealingPlan,
  HealingExecution,
  AutoHealingConfig,
} from '@/lib/fall/healing';

/**
 * POST /api/fall/healing/fix
 *
 * Execute auto-fix on data that failed validation
 *
 * Body (option 1 - provide healing plan):
 * {
 *   "plan": { ... HealingPlan object ... },
 *   "data": { ... original data ... }
 * }
 *
 * Body (option 2 - auto-fix with contract):
 * {
 *   "contract_id": "uuid",
 *   "data": { ... data to validate and fix ... }
 * }
 *
 * Body (option 3 - inline contract):
 * {
 *   "contract": { ... contract definition ... },
 *   "data": { ... data to validate and fix ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    if (body.data === undefined) {
      return NextResponse.json(
        { error: 'data field is required' },
        { status: 400 }
      );
    }

    const data = body.data;
    const supabase = createServerClient();

    // Fetch user's healing rules and config
    const [rulesResult, configResult] = await Promise.all([
      supabase
        .from('fall_healing_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('enabled', true)
        .order('priority', { ascending: true }),
      supabase
        .from('fall_healing_configs')
        .select('config')
        .eq('user_id', userId)
        .single(),
    ]);

    const rules: HealingRule[] = (rulesResult.data || []).map(rowToHealingRule);
    const config: Partial<AutoHealingConfig> = configResult.data?.config || {};

    let plan: HealingPlan;
    let validationResult: ValidationResult | undefined;
    let contractId: string | null = null;

    // Option 1: Healing plan provided
    if (body.plan) {
      plan = body.plan;
      validationResult = plan.validationResult;
    }
    // Option 2: Contract ID provided
    else if (body.contract_id) {
      const { data: contractRow, error } = await supabase
        .from('fall_contracts')
        .select('*')
        .eq('id', body.contract_id)
        .eq('user_id', userId)
        .single();

      if (error || !contractRow) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }

      const contract = rowToContract(contractRow as ContractRow);
      contractId = contract.id;

      // Validate data
      validationResult = validateContract(contract, data);

      // Check if validation passed
      if (validationResult.status === 'pass') {
        return NextResponse.json({
          success: true,
          message: 'Data already passes validation, no fix needed',
          validationResult,
          healedData: data,
        });
      }

      // Generate healing plan
      plan = analyzeFailures(validationResult, rules, config);
    }
    // Option 3: Inline contract
    else if (body.contract) {
      const now = new Date().toISOString();
      const contract: Contract = {
        id: 'inline-contract',
        user_id: userId,
        name: body.contract.name || 'Inline Contract',
        version: body.contract.version || '1.0.0',
        assertions: (body.contract.assertions || []).map((a: any, i: number) => ({
          id: `inline-assertion-${i}`,
          type: a.type,
          field: a.field,
          params: a.params,
          message: a.message,
          severity: a.severity || 'error',
        })),
        created_at: now,
        updated_at: now,
      };

      // Validate data
      validationResult = validateContract(contract, data);

      // Check if validation passed
      if (validationResult.status === 'pass') {
        return NextResponse.json({
          success: true,
          message: 'Data already passes validation, no fix needed',
          validationResult,
          healedData: data,
        });
      }

      // Generate healing plan
      plan = analyzeFailures(validationResult, rules, config);
    } else {
      return NextResponse.json(
        { error: 'Must provide plan, contract_id, or contract' },
        { status: 400 }
      );
    }

    // Execute healing
    const execution = await executeHealingPlan(plan, data, {
      config: config as Record<string, unknown>,
    });

    // Log to history
    await logHealingHistory(supabase, userId, contractId, validationResult, execution);

    return NextResponse.json({
      success: true,
      execution,
      originalData: data,
      healedData: execution.healedData,
      validationResult,
    });
  } catch (err) {
    console.error('Fall healing fix error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    version: row.version,
    assertions: row.assertions,
    metadata: row.metadata ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToHealingRule(row: HealingRuleRow): HealingRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    assertionType: row.assertion_type ?? undefined,
    errorPattern: row.error_pattern ?? undefined,
    strategy: row.strategy,
    config: row.config,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function logHealingHistory(
  supabase: any,
  userId: string,
  contractId: string | null,
  validationResult: ValidationResult | undefined,
  execution: HealingExecution
): Promise<void> {
  try {
    await supabase.from('fall_healing_history').insert({
      user_id: userId,
      contract_id: contractId,
      validation_id: validationResult?.contractId,
      status: execution.status,
      original_data: execution.originalData,
      healed_data: execution.healedData,
      actions_count: execution.results.length,
      successful_actions: execution.successfulActions,
      failed_actions: execution.failedActions,
      duration_ms: execution.totalDurationMs || 0,
      results: execution.results,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to log healing history:', err);
    // Don't throw - logging failure shouldn't break the fix operation
  }
}
