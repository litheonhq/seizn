/**
 * ECL Models API
 *
 * CRUD operations for ECL translation models
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { parsePagination } from '@/lib/parse-params';
import type {
  CreateModelRequest,
  ECLTranslationModelRow,
} from '@/lib/ecl/types';
import { rowToModel } from '@/lib/ecl/types';

// ============================================
// GET /api/ecl/models - List ECL models
// ============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const status = searchParams.get('status');
    const sourceModel = searchParams.get('source_model');
    const targetModel = searchParams.get('target_model');
    const { limit, offset } = parsePagination(searchParams, { limit: 50 });

    const supabase = createServerClient();

    // Build query
    let query = supabase
      .from('ecl_translation_models')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (sourceModel) {
      query = query.eq('source_model', sourceModel);
    }
    if (targetModel) {
      query = query.eq('target_model', targetModel);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('List ECL models error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/models', method: 'GET', startTime },
        500
      );
      return ServerErrors.database('list_ecl_models');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/models', method: 'GET', startTime },
      200
    );

    const models = (data as ECLTranslationModelRow[]).map(rowToModel);

    return NextResponse.json({
      success: true,
      models,
      count: count ?? 0,
      pagination: {
        limit,
        offset,
        hasMore: (count ?? 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('List ECL models error:', error);
    return ServerErrors.internal('list_ecl_models');
  }
}

// ============================================
// POST /api/ecl/models - Create ECL model
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: CreateModelRequest = await request.json();

    // Validate required fields
    if (!body.name?.trim()) {
      return ValidationErrors.missingField('name');
    }
    if (!body.sourceModel) {
      return ValidationErrors.missingField('sourceModel');
    }
    if (!body.targetModel) {
      return ValidationErrors.missingField('targetModel');
    }
    if (!body.sourceDim || body.sourceDim <= 0) {
      return ValidationErrors.invalidField('sourceDim', 'must be a positive integer');
    }
    if (!body.targetDim || body.targetDim <= 0) {
      return ValidationErrors.invalidField('targetDim', 'must be a positive integer');
    }

    // Validate translation type
    const validTypes = ['linear', 'affine', 'mlp'];
    if (body.translationType && !validTypes.includes(body.translationType)) {
      return ValidationErrors.invalidField(
        'translationType',
        `must be one of: ${validTypes.join(', ')}`
      );
    }

    const supabase = createServerClient();

    // Check for existing model with same source/target pair
    const { data: existing } = await supabase
      .from('ecl_translation_models')
      .select('id')
      .eq('user_id', userId)
      .eq('source_model', body.sourceModel)
      .eq('target_model', body.targetModel)
      .neq('status', 'archived')
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: {
            error_code: 'RESOURCE_ALREADY_EXISTS',
            message: `ECL model for ${body.sourceModel} -> ${body.targetModel} already exists`,
            hint: 'Archive or delete the existing model before creating a new one',
            details: { existing_model_id: existing.id },
          },
        },
        { status: 409 }
      );
    }

    // Create the model
    const { data, error } = await supabase
      .from('ecl_translation_models')
      .insert({
        user_id: userId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        source_model: body.sourceModel,
        target_model: body.targetModel,
        source_dim: body.sourceDim,
        target_dim: body.targetDim,
        translation_type: body.translationType || 'linear',
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Create ECL model error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/models', method: 'POST', startTime },
        500
      );
      return ServerErrors.database('create_ecl_model');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/models', method: 'POST', startTime },
      201
    );

    const model = rowToModel(data as ECLTranslationModelRow);

    return NextResponse.json({ success: true, model }, { status: 201 });
  } catch (error) {
    console.error('Create ECL model error:', error);
    return ServerErrors.internal('create_ecl_model');
  }
}

// ============================================
// DELETE /api/ecl/models - Delete ECL model
// ============================================

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const modelId = searchParams.get('id');
    if (!modelId) {
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('ecl_translation_models')
      .select('id')
      .eq('id', modelId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('ECL model', modelId);
    }

    // Delete the model (cascades to training pairs)
    const { error } = await supabase
      .from('ecl_translation_models')
      .delete()
      .eq('id', modelId);

    if (error) {
      console.error('Delete ECL model error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/models', method: 'DELETE', startTime },
        500
      );
      return ServerErrors.database('delete_ecl_model');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/models', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({ success: true, deleted: modelId });
  } catch (error) {
    console.error('Delete ECL model error:', error);
    return ServerErrors.internal('delete_ecl_model');
  }
}

// ============================================
// PATCH /api/ecl/models - Update ECL model
// ============================================

export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const modelId = searchParams.get('id');
    if (!modelId) {
      return ValidationErrors.missingField('id');
    }

    const body = await request.json();
    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('ecl_translation_models')
      .select('id, status')
      .eq('id', modelId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('ECL model', modelId);
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }
    if (body.description !== undefined) {
      updates.description = body.description?.trim() || null;
    }
    if (body.status !== undefined) {
      const validStatuses = ['pending', 'archived'];
      if (!validStatuses.includes(body.status)) {
        return ValidationErrors.invalidField(
          'status',
          `can only be set to: ${validStatuses.join(', ')}`
        );
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return ValidationErrors.invalidBody('No valid fields to update');
    }

    const { data, error } = await supabase
      .from('ecl_translation_models')
      .update(updates)
      .eq('id', modelId)
      .select('*')
      .single();

    if (error) {
      console.error('Update ECL model error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/models', method: 'PATCH', startTime },
        500
      );
      return ServerErrors.database('update_ecl_model');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/models', method: 'PATCH', startTime },
      200
    );

    const model = rowToModel(data as ECLTranslationModelRow);

    return NextResponse.json({ success: true, model });
  } catch (error) {
    console.error('Update ECL model error:', error);
    return ServerErrors.internal('update_ecl_model');
  }
}
