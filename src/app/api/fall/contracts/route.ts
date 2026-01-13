/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { createContract } from '@/lib/fall/contracts';
import type { ContractInput, ContractRow } from '@/lib/fall/contracts';

/**
 * GET /api/fall/contracts
 *
 * List all contracts for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('fall_contracts')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      contracts: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('Fall contracts GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/fall/contracts
 *
 * Create a new contract
 *
 * Body:
 * {
 *   "name": "string",
 *   "description"?: "string",
 *   "version"?: "string",
 *   "assertions": [
 *     {
 *       "type": "hasField" | "matchesSchema" | "matchesRegex" | "inRange" | "oneOf" | "minLength" | "maxLength" | "isType" | "isNonEmpty" | "isArray" | "arrayLength" | "custom",
 *       "field"?: "string",
 *       "params"?: { ... },
 *       "message"?: "string",
 *       "severity"?: "error" | "warning"
 *     }
 *   ],
 *   "metadata"?: { ... }
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

    // Validate required fields
    const name = body?.name;
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name (string) is required' },
        { status: 400 }
      );
    }

    const assertions = body?.assertions;
    if (!Array.isArray(assertions) || assertions.length === 0) {
      return NextResponse.json(
        { error: 'assertions (array) is required and must contain at least one assertion' },
        { status: 400 }
      );
    }

    // Validate assertion types
    const validTypes = [
      'hasField', 'matchesSchema', 'matchesRegex', 'inRange', 'oneOf',
      'minLength', 'maxLength', 'isType', 'isNonEmpty', 'isArray',
      'arrayLength', 'custom',
    ];

    for (const assertion of assertions) {
      if (!validTypes.includes(assertion?.type)) {
        return NextResponse.json(
          { error: `Invalid assertion type: ${assertion?.type}. Valid types: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const contractInput: ContractInput = {
      name,
      description: body?.description,
      version: body?.version || '1.0.0',
      assertions: assertions.map((a: any) => ({
        type: a.type,
        field: a.field,
        params: a.params,
        message: a.message,
        severity: a.severity || 'error',
      })),
      metadata: body?.metadata,
    };

    const contract = createContract(userId, contractInput);
    const now = new Date().toISOString();

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('fall_contracts')
      .insert({
        id: contract.id,
        user_id: userId,
        name: contract.name,
        description: contract.description ?? null,
        version: contract.version,
        assertions: contract.assertions,
        metadata: contract.metadata ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('id, name, version, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        contract: data,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Fall contracts POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
