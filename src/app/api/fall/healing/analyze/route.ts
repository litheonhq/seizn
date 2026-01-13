/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { validateContract } from '@/lib/fall/contracts';
import { analyzeFailures } from '@/lib/fall/healing';
import type { Contract, ContractRow, ValidationResult } from '@/lib/fall/contracts';
import type { HealingRule, HealingRuleRow, AutoHealingConfig } from '@/lib/fall/healing';

/**
 * POST /api/fall/healing/analyze
 *
 * Analyze validation failures and generate a healing plan
 *
 * Body (option 1 - provide validation result directly):
 * {
 *   "validation_result": { ... ValidationResult object ... }
 * }
 *
 * Body (option 2 - validate and analyze):
 * {
 *   "contract_id": "uuid",
 *   "data": { ... }
 * }
 *
 * Body (option 3 - inline contract):
 * {
 *   "contract": { ... contract definition ... },
 *   "data": { ... }
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
    const supabase = createServerClient();

    let validationResult: ValidationResult;

    // Option 1: Validation result provided directly
    if (body.validation_result) {
      validationResult = body.validation_result;
    }
    // Option 2: Validate against saved contract
    else if (body.contract_id && body.data !== undefined) {
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
      validationResult = validateContract(contract, body.data);
    }
    // Option 3: Inline contract
    else if (body.contract && body.data !== undefined) {
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

      validationResult = validateContract(contract, body.data);
    } else {
      return NextResponse.json(
        { error: 'Must provide validation_result, contract_id with data, or contract with data' },
        { status: 400 }
      );
    }

    // Fetch user's healing rules
    const { data: ruleRows } = await supabase
      .from('fall_healing_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true)
      .order('priority', { ascending: true });

    const rules: HealingRule[] = (ruleRows || []).map(rowToHealingRule);

    // Get user's healing config (if stored)
    const { data: configData } = await supabase
      .from('fall_healing_configs')
      .select('config')
      .eq('user_id', userId)
      .single();

    const config: Partial<AutoHealingConfig> = configData?.config || {};

    // Generate healing plan
    const plan = analyzeFailures(validationResult, rules, config);

    return NextResponse.json({
      success: true,
      plan,
      validationResult,
    });
  } catch (err) {
    console.error('Fall healing analyze error:', err);
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
