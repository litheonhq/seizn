/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/fall/contracts/:id
 *
 * Get a specific contract by ID
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await context.params;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('fall_contracts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      contract: data,
    });
  } catch (err) {
    console.error('Fall contract GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/fall/contracts/:id
 *
 * Update an existing contract
 *
 * Body:
 * {
 *   "name"?: "string",
 *   "description"?: "string",
 *   "version"?: "string",
 *   "assertions"?: [ ... ],
 *   "metadata"?: { ... }
 * }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await context.params;
    const body = await request.json();

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('fall_contracts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.version !== undefined) updates.version = body.version;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (body.assertions !== undefined) {
      // Validate assertion types
      const validTypes = [
        'hasField', 'matchesSchema', 'matchesRegex', 'inRange', 'oneOf',
        'minLength', 'maxLength', 'isType', 'isNonEmpty', 'isArray',
        'arrayLength',
      ];

      if (!Array.isArray(body.assertions) || body.assertions.length === 0) {
        return NextResponse.json(
          { error: 'assertions must be a non-empty array' },
          { status: 400 }
        );
      }

      for (const assertion of body.assertions) {
        if (!validTypes.includes(assertion?.type)) {
          return NextResponse.json(
            { error: `Invalid assertion type: ${assertion?.type}` },
            { status: 400 }
          );
        }
      }

      updates.assertions = body.assertions.map((a: any, index: number) => ({
        id: a.id || `${id}-assertion-${index}`,
        type: a.type,
        field: a.field,
        params: a.params,
        message: a.message,
        severity: a.severity || 'error',
      }));
    }

    const { data, error } = await supabase
      .from('fall_contracts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      contract: data,
    });
  } catch (err) {
    console.error('Fall contract PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/fall/contracts/:id
 *
 * Delete a contract
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await context.params;
    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('fall_contracts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('fall_contracts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Contract deleted',
    });
  } catch (err) {
    console.error('Fall contract DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
