/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import {
  validateContract,
  validateContracts,
  quickValidate,
  summarizeValidations,
} from '@/lib/fall/contracts';
import type { Contract, ContractRow, QuickValidationOptions } from '@/lib/fall/contracts';

/**
 * POST /api/fall/contracts/validate
 *
 * Validate data against one or more contracts
 *
 * Body (option 1 - validate against saved contracts):
 * {
 *   "contract_ids": ["uuid1", "uuid2"],
 *   "data": { ... }
 * }
 *
 * Body (option 2 - validate against inline contract):
 * {
 *   "contract": {
 *     "name": "...",
 *     "assertions": [...]
 *   },
 *   "data": { ... }
 * }
 *
 * Body (option 3 - quick validation):
 * {
 *   "quick": {
 *     "hasFields": ["field1", "field2"],
 *     "nonEmptyFields": ["field1"],
 *     "inRanges": [{ "field": "count", "min": 0, "max": 100 }]
 *   },
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

    // Validate required data field
    if (body?.data === undefined) {
      return NextResponse.json(
        { error: 'data field is required' },
        { status: 400 }
      );
    }

    const data = body.data;
    const supabase = createServerClient();

    // Option 1: Validate against saved contracts
    if (body.contract_ids && Array.isArray(body.contract_ids)) {
      const contractIds = body.contract_ids;

      if (contractIds.length === 0) {
        return NextResponse.json(
          { error: 'contract_ids must contain at least one contract ID' },
          { status: 400 }
        );
      }

      // Fetch contracts
      const { data: contractRows, error } = await supabase
        .from('fall_contracts')
        .select('*')
        .in('id', contractIds)
        .eq('user_id', userId);

      if (error) throw error;

      if (!contractRows || contractRows.length === 0) {
        return NextResponse.json(
          { error: 'No contracts found with the provided IDs' },
          { status: 404 }
        );
      }

      // Convert rows to Contract objects
      const contracts: Contract[] = contractRows.map((row: ContractRow) => ({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        description: row.description ?? undefined,
        version: row.version,
        assertions: row.assertions,
        metadata: row.metadata ?? undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      // Validate
      const results = validateContracts(contracts, data);
      const summary = summarizeValidations(results);

      // Log validation
      await logValidation(supabase, userId, results);

      return NextResponse.json({
        success: true,
        summary,
        results,
      });
    }

    // Option 2: Validate against inline contract
    if (body.contract) {
      const contractInput = body.contract;

      if (!contractInput.name || !Array.isArray(contractInput.assertions)) {
        return NextResponse.json(
          { error: 'Inline contract must have name and assertions' },
          { status: 400 }
        );
      }

      // Create temporary contract
      const now = new Date().toISOString();
      const contract: Contract = {
        id: 'inline-contract',
        user_id: userId,
        name: contractInput.name,
        description: contractInput.description,
        version: contractInput.version || '1.0.0',
        assertions: contractInput.assertions.map((a: any, i: number) => ({
          id: `inline-assertion-${i}`,
          type: a.type,
          field: a.field,
          params: a.params,
          message: a.message,
          severity: a.severity || 'error',
        })),
        metadata: contractInput.metadata,
        created_at: now,
        updated_at: now,
      };

      const result = validateContract(contract, data);

      return NextResponse.json({
        success: true,
        result,
      });
    }

    // Option 3: Quick validation
    if (body.quick) {
      const quickOptions: QuickValidationOptions = {};

      if (body.quick.hasFields) {
        quickOptions.hasFields = body.quick.hasFields;
      }
      if (body.quick.nonEmptyFields) {
        quickOptions.nonEmptyFields = body.quick.nonEmptyFields;
      }
      if (body.quick.inRanges) {
        quickOptions.inRanges = body.quick.inRanges;
      }
      if (body.quick.matchesSchemas) {
        quickOptions.matchesSchemas = body.quick.matchesSchemas;
      }
      if (body.quick.regexPatterns) {
        quickOptions.regexPatterns = body.quick.regexPatterns;
      }

      const result = quickValidate(data, quickOptions);

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json(
      { error: 'Must provide contract_ids, contract, or quick validation options' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Fall contracts validate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Log validation results to database
 */
async function logValidation(
  supabase: any,
  userId: string,
  results: any[]
): Promise<void> {
  try {
    const logs = results.map(result => ({
      contract_id: result.contractId !== 'inline-contract' ? result.contractId : null,
      user_id: userId,
      status: result.status,
      duration_ms: result.durationMs,
      total_assertions: result.totalAssertions,
      passed: result.passed,
      failed: result.failed,
      warnings: result.warnings,
      results: result.results,
      created_at: result.timestamp,
    }));

    await supabase.from('fall_validation_logs').insert(logs);
  } catch (err) {
    console.error('Failed to log validation:', err);
    // Don't throw - logging failure shouldn't break validation
  }
}
