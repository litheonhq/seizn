/**
 * Seizn Policy Simulator - Policies API
 *
 * CRUD operations for policy definitions.
 *
 * GET /api/policies - List policies
 * POST /api/policies - Create a new policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import {
  parsePolicy,
  parsePolicyJson,
  validatePolicy,
  serializeToJson,
  PolicyParseError,
} from '@/lib/policy-simulator';
import type { PolicyType, CreatePolicyInput as _CreatePolicyInput } from '@/lib/policy-simulator';

// ============================================
// GET /api/policies - List policies
// ============================================

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    // Query params
    const policyType = searchParams.get('type') as PolicyType | null;
    const activeOnly = searchParams.get('active') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    let query = supabase
      .from('policy_definitions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (policyType) {
      query = query.eq('policy_type', policyType);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to list policies:', error);
      return NextResponse.json(
        { error: 'Failed to list policies' },
        { status: 500 }
      );
    }

    const policies = (data || []).map(mapPolicyFromDb);

    return NextResponse.json({
      success: true,
      policies,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (err) {
    console.error('List policies error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// POST /api/policies - Create policy
// ============================================

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    // Validate required fields
    const { name, policy_type, policy_yaml, policy_json, description } = body as {
      name?: string;
      policy_type?: PolicyType;
      policy_yaml?: string;
      policy_json?: unknown;
      description?: string;
    };

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!policy_type || !isValidPolicyType(policy_type)) {
      return NextResponse.json(
        {
          error: 'policy_type must be one of: pii_masking, access_control, ttl, scope, content_filter',
        },
        { status: 400 }
      );
    }

    if (!policy_yaml && !policy_json) {
      return NextResponse.json(
        { error: 'Either policy_yaml or policy_json is required' },
        { status: 400 }
      );
    }

    // Parse and validate policy
    let rules;
    try {
      if (policy_yaml) {
        rules = parsePolicy(policy_yaml);
      } else {
        rules = parsePolicyJson(policy_json);
      }
    } catch (err) {
      const message = err instanceof PolicyParseError ? err.message : 'Invalid policy format';
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    // Validate rules
    const validation = validatePolicy(rules);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Policy validation failed',
          errors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 }
      );
    }

    // Serialize to JSON for storage
    const policyJsonData = serializeToJson(rules);

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('policy_definitions')
      .insert({
        user_id: userId,
        name,
        description: description || null,
        policy_type,
        policy_yaml: policy_yaml || null,
        policy_json: policyJsonData,
        is_active: false,
        is_draft: true,
        version: 1,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create policy:', error);
      return NextResponse.json(
        { error: 'Failed to create policy' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        policy: mapPolicyFromDb(data),
        validation: {
          warnings: validation.warnings,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Create policy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// Helper Functions
// ============================================

function isValidPolicyType(type: string): type is PolicyType {
  return ['pii_masking', 'access_control', 'ttl', 'scope', 'content_filter'].includes(type);
}

interface DbPolicy {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  policy_yaml: string | null;
  policy_json: Record<string, unknown>;
  policy_type: string;
  version: number;
  is_active: boolean;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

function mapPolicyFromDb(row: DbPolicy) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    policyYaml: row.policy_yaml,
    policyJson: row.policy_json,
    policyType: row.policy_type as PolicyType,
    version: row.version,
    isActive: row.is_active,
    isDraft: row.is_draft,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
