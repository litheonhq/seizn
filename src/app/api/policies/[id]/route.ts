/**
 * Seizn Policy Simulator - Single Policy API
 *
 * GET /api/policies/[id] - Get a policy
 * PATCH /api/policies/[id] - Update a policy
 * DELETE /api/policies/[id] - Delete a policy
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
import type { PolicyType } from '@/lib/policy-simulator';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================
// GET /api/policies/[id] - Get policy
// ============================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('policy_definitions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: mapPolicyFromDb(data),
    });
  } catch (err) {
    console.error('Get policy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// PATCH /api/policies/[id] - Update policy
// ============================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;
    const body = await request.json();

    const supabase = createServerClient();

    // First check the policy exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('policy_definitions')
      .select('id, version')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json(
          { error: 'name must be a non-empty string' },
          { status: 400 }
        );
      }
      updatePayload.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updatePayload.description = body.description || null;
    }

    // Handle policy content update
    if (body.policy_yaml || body.policy_json) {
      let rules;
      try {
        if (body.policy_yaml) {
          rules = parsePolicy(body.policy_yaml);
          updatePayload.policy_yaml = body.policy_yaml;
        } else {
          rules = parsePolicyJson(body.policy_json);
          updatePayload.policy_yaml = null;
        }
      } catch (err) {
        const message = err instanceof PolicyParseError ? err.message : 'Invalid policy format';
        return NextResponse.json({ error: message }, { status: 400 });
      }

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

      updatePayload.policy_json = serializeToJson(rules);
      // Increment version when content changes
      updatePayload.version = existing.version + 1;
    }

    // Handle activation
    if (body.is_active !== undefined) {
      if (body.is_active === true) {
        // Use the database function to activate (deactivates others of same type)
        const { data: activated, error: activateError } = await supabase.rpc(
          'activate_policy',
          { p_policy_id: id }
        );

        if (activateError) {
          console.error('Failed to activate policy:', activateError);
          return NextResponse.json(
            { error: 'Failed to activate policy' },
            { status: 500 }
          );
        }
      } else {
        updatePayload.is_active = false;
      }
    }

    if (body.is_draft !== undefined) {
      updatePayload.is_draft = body.is_draft;
    }

    // Only update if there are changes
    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('policy_definitions')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update policy:', updateError);
        return NextResponse.json(
          { error: 'Failed to update policy' },
          { status: 500 }
        );
      }
    }

    // Fetch updated policy
    const { data: updated, error: refetchError } = await supabase
      .from('policy_definitions')
      .select('*')
      .eq('id', id)
      .single();

    if (refetchError || !updated) {
      return NextResponse.json(
        { error: 'Failed to fetch updated policy' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: mapPolicyFromDb(updated),
    });
  } catch (err) {
    console.error('Update policy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// DELETE /api/policies/[id] - Delete policy
// ============================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;

    const supabase = createServerClient();

    // Check if policy exists and is not active
    const { data: existing, error: fetchError } = await supabase
      .from('policy_definitions')
      .select('id, is_active')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    // Prevent deletion of active policies
    if (existing.is_active) {
      return NextResponse.json(
        { error: 'Cannot delete an active policy. Deactivate it first.' },
        { status: 400 }
      );
    }

    // Delete the policy
    const { error: deleteError } = await supabase
      .from('policy_definitions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete policy:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete policy' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Policy deleted',
    });
  } catch (err) {
    console.error('Delete policy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// Helper Functions
// ============================================

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
