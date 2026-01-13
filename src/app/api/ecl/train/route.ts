/**
 * ECL Training API
 *
 * Add training pairs and train ECL translation models
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import {
  trainTranslation,
  clearTranslatorCache,
  DEFAULT_TRAINING_CONFIG,
} from '@/lib/ecl';
import type {
  AddTrainingPairsRequest,
  StartTrainingRequest,
  TrainingConfig,
  ECLTranslationModelRow as _ECLTranslationModelRow,
  ECLTrainingPairRow,
} from '@/lib/ecl/types';
import { rowToModel as _rowToModel, rowToPair } from '@/lib/ecl/types';

// ============================================
// POST /api/ecl/train - Add training pairs or start training
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'add_pairs';

    if (action === 'start') {
      return handleStartTraining(request, userId, keyId, startTime);
    } else {
      return handleAddPairs(request, userId, keyId, startTime);
    }
  } catch (error) {
    console.error('ECL train error:', error);
    return ServerErrors.internal('ecl_train');
  }
}

// ============================================
// Add Training Pairs
// ============================================

async function handleAddPairs(
  request: NextRequest,
  userId: string,
  keyId: string,
  startTime: number
) {
  const body: AddTrainingPairsRequest = await request.json();

  // Validate input
  if (!body.modelId) {
    return ValidationErrors.missingField('modelId');
  }
  if (!body.pairs || !Array.isArray(body.pairs) || body.pairs.length === 0) {
    return ValidationErrors.missingField('pairs');
  }

  const supabase = createServerClient();

  // Verify model ownership and get dimensions
  const { data: model } = await supabase
    .from('ecl_translation_models')
    .select('*')
    .eq('id', body.modelId)
    .eq('user_id', userId)
    .single();

  if (!model) {
    return NotFoundErrors.resource('ECL model', body.modelId);
  }

  // Check model status
  if (model.status === 'training') {
    return NextResponse.json(
      {
        error: {
          error_code: 'ECL_MODEL_BUSY',
          message: 'Model is currently training. Wait for training to complete.',
          hint: 'Poll the model status endpoint to check when training completes',
        },
      },
      { status: 409 }
    );
  }

  // Validate and prepare pairs
  const validationSplit = body.validationSplit ?? 0.2;
  const pairs: Array<{
    model_id: string;
    source_vector: string;
    target_vector: string;
    text_hash: string;
    text_preview: string | null;
    is_validation: boolean;
  }> = [];

  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < body.pairs.length; i++) {
    const pair = body.pairs[i];

    // Validate dimensions
    if (!pair.sourceVector || pair.sourceVector.length !== model.source_dim) {
      errors.push({
        index: i,
        error: `Source vector dimension mismatch: expected ${model.source_dim}, got ${pair.sourceVector?.length}`,
      });
      continue;
    }
    if (!pair.targetVector || pair.targetVector.length !== model.target_dim) {
      errors.push({
        index: i,
        error: `Target vector dimension mismatch: expected ${model.target_dim}, got ${pair.targetVector?.length}`,
      });
      continue;
    }
    if (!pair.text) {
      errors.push({ index: i, error: 'Missing text field' });
      continue;
    }

    // Compute text hash for deduplication
    const textHash = createHash('sha256').update(pair.text).digest('hex');

    // Randomly assign to validation set
    const isValidation = Math.random() < validationSplit;

    pairs.push({
      model_id: body.modelId,
      source_vector: `[${pair.sourceVector.join(',')}]`,
      target_vector: `[${pair.targetVector.join(',')}]`,
      text_hash: textHash,
      text_preview: pair.text.substring(0, 200),
      is_validation: isValidation,
    });
  }

  if (pairs.length === 0) {
    return NextResponse.json(
      {
        error: {
          error_code: 'VALIDATION_ERROR',
          message: 'No valid training pairs provided',
          details: { errors },
        },
      },
      { status: 400 }
    );
  }

  // Insert pairs (ignore duplicates)
  const { data: inserted, error: insertError } = await supabase
    .from('ecl_training_pairs')
    .upsert(pairs, {
      onConflict: 'model_id,text_hash',
      ignoreDuplicates: true,
    })
    .select('id');

  if (insertError) {
    console.error('Insert training pairs error:', insertError);
    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/train', method: 'POST', startTime },
      500
    );
    return ServerErrors.database('insert_training_pairs');
  }

  // Reset model status to pending if it was ready
  if (model.status === 'ready') {
    await supabase
      .from('ecl_translation_models')
      .update({ status: 'pending' })
      .eq('id', body.modelId);
  }

  await logRequest(
    { userId, keyId, endpoint: '/api/ecl/train', method: 'POST', startTime },
    200
  );

  return NextResponse.json({
    success: true,
    added: inserted?.length ?? 0,
    skipped: pairs.length - (inserted?.length ?? 0),
    errors: errors.length > 0 ? errors : undefined,
    modelId: body.modelId,
  });
}

// ============================================
// Start Training
// ============================================

async function handleStartTraining(
  request: NextRequest,
  userId: string,
  keyId: string,
  startTime: number
) {
  const body: StartTrainingRequest = await request.json();

  if (!body.modelId) {
    return ValidationErrors.missingField('modelId');
  }

  const supabase = createServerClient();

  // Get model and verify ownership
  const { data: modelRow } = await supabase
    .from('ecl_translation_models')
    .select('*')
    .eq('id', body.modelId)
    .eq('user_id', userId)
    .single();

  if (!modelRow) {
    return NotFoundErrors.resource('ECL model', body.modelId);
  }

  // Check model status
  if (modelRow.status === 'training') {
    return NextResponse.json(
      {
        error: {
          error_code: 'ECL_MODEL_BUSY',
          message: 'Model is already training',
          hint: 'Wait for the current training to complete',
        },
      },
      { status: 409 }
    );
  }

  // Get training pairs
  const { data: pairRows, count: _count } = await supabase
    .from('ecl_training_pairs')
    .select('*', { count: 'exact' })
    .eq('model_id', body.modelId);

  if (!pairRows || pairRows.length < 10) {
    return NextResponse.json(
      {
        error: {
          error_code: 'ECL_INSUFFICIENT_PAIRS',
          message: `Insufficient training pairs: ${pairRows?.length ?? 0}. Need at least 10.`,
          hint: 'Add more training pairs using the add_pairs endpoint',
        },
      },
      { status: 400 }
    );
  }

  // Update status to training
  await supabase
    .from('ecl_translation_models')
    .update({ status: 'training', error_message: null })
    .eq('id', body.modelId);

  // Merge config with defaults
  const config: TrainingConfig = {
    ...DEFAULT_TRAINING_CONFIG,
    ...body.config,
    type: modelRow.translation_type as TrainingConfig['type'],
  };

  try {
    // Convert pair rows to training data
    const pairs = (pairRows as ECLTrainingPairRow[]).map((row) => {
      const pair = rowToPair(row);
      return {
        source: pair.sourceVector,
        target: pair.targetVector,
      };
    });

    // Train the model
    const result = await trainTranslation(
      modelRow.source_dim,
      modelRow.target_dim,
      pairs,
      config
    );

    if (!result.success) {
      // Update model with failure
      await supabase
        .from('ecl_translation_models')
        .update({
          status: 'failed',
          error_message: result.error || 'Training failed',
        })
        .eq('id', body.modelId);

      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/train', method: 'POST', startTime },
        500
      );

      return NextResponse.json(
        {
          error: {
            error_code: 'ECL_TRAINING_FAILED',
            message: result.error || 'Training failed',
            details: { metrics: result.metrics },
          },
        },
        { status: 500 }
      );
    }

    // Update model with trained weights
    await supabase
      .from('ecl_translation_models')
      .update({
        status: 'ready',
        weights: result.weights,
        bias: result.bias || null,
        validation_rmse: result.metrics.rmse,
        validation_r2: result.metrics.r2,
        cosine_similarity_mean: result.metrics.cosineSimilarityMean,
        training_config: config,
        trained_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', body.modelId);

    // Clear translator cache so new weights are used
    clearTranslatorCache(body.modelId);

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/train', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      modelId: body.modelId,
      metrics: result.metrics,
    });
  } catch (error) {
    console.error('Training error:', error);

    // Update model with failure
    await supabase
      .from('ecl_translation_models')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Training failed',
      })
      .eq('id', body.modelId);

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/train', method: 'POST', startTime },
      500
    );

    return ServerErrors.internal('ecl_training');
  }
}

// ============================================
// GET /api/ecl/train - Get training pairs info
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

    const modelId = searchParams.get('model_id');
    if (!modelId) {
      return ValidationErrors.missingField('model_id');
    }

    const supabase = createServerClient();

    // Verify model ownership
    const { data: model } = await supabase
      .from('ecl_translation_models')
      .select('id')
      .eq('id', modelId)
      .eq('user_id', userId)
      .single();

    if (!model) {
      return NotFoundErrors.resource('ECL model', modelId);
    }

    // Get pair statistics
    const { data: stats } = await supabase.rpc('get_ecl_model_stats', {
      p_model_id: modelId,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/train', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      modelId,
      stats: stats?.[0] || {
        total_pairs: 0,
        training_pairs: 0,
        validation_pairs: 0,
        avg_source_norm: null,
        avg_target_norm: null,
      },
    });
  } catch (error) {
    console.error('Get training stats error:', error);
    return ServerErrors.internal('get_training_stats');
  }
}

// ============================================
// DELETE /api/ecl/train - Clear training pairs
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

    const modelId = searchParams.get('model_id');
    if (!modelId) {
      return ValidationErrors.missingField('model_id');
    }

    const supabase = createServerClient();

    // Verify model ownership
    const { data: model } = await supabase
      .from('ecl_translation_models')
      .select('id, status')
      .eq('id', modelId)
      .eq('user_id', userId)
      .single();

    if (!model) {
      return NotFoundErrors.resource('ECL model', modelId);
    }

    // Don't allow clearing during training
    if (model.status === 'training') {
      return NextResponse.json(
        {
          error: {
            error_code: 'ECL_MODEL_BUSY',
            message: 'Cannot clear pairs while model is training',
            hint: 'Wait for training to complete',
          },
        },
        { status: 409 }
      );
    }

    // Delete all training pairs
    const { error, count } = await supabase
      .from('ecl_training_pairs')
      .delete()
      .eq('model_id', modelId);

    if (error) {
      console.error('Clear training pairs error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/ecl/train', method: 'DELETE', startTime },
        500
      );
      return ServerErrors.database('clear_training_pairs');
    }

    // Reset model status
    await supabase
      .from('ecl_translation_models')
      .update({
        status: 'pending',
        weights: null,
        bias: null,
        validation_rmse: null,
        validation_r2: null,
        cosine_similarity_mean: null,
        trained_at: null,
      })
      .eq('id', modelId);

    // Clear cache
    clearTranslatorCache(modelId);

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/train', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      modelId,
      deleted: count ?? 0,
    });
  } catch (error) {
    console.error('Clear training pairs error:', error);
    return ServerErrors.internal('clear_training_pairs');
  }
}
