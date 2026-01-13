/**
 * ECL Translation API
 *
 * Apply trained ECL models to translate vectors
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
import { loadTranslator, getTranslatorForModels } from '@/lib/ecl';
import type { TranslateRequest, ECLTranslationModelRow } from '@/lib/ecl/types';
import { rowToModel } from '@/lib/ecl/types';

// ============================================
// POST /api/ecl/translate - Translate vectors
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: TranslateRequest = await request.json();

    // Validate input
    if (!body.modelId) {
      return ValidationErrors.missingField('modelId');
    }
    if (!body.vectors || !Array.isArray(body.vectors) || body.vectors.length === 0) {
      return ValidationErrors.missingField('vectors');
    }

    // Validate vector array structure
    for (let i = 0; i < body.vectors.length; i++) {
      if (!Array.isArray(body.vectors[i])) {
        return ValidationErrors.invalidField(
          `vectors[${i}]`,
          'must be an array of numbers'
        );
      }
    }

    const supabase = createServerClient();

    // Verify model ownership
    const { data: modelRow } = await supabase
      .from('ecl_translation_models')
      .select('*')
      .eq('id', body.modelId)
      .eq('user_id', userId)
      .single();

    if (!modelRow) {
      return NotFoundErrors.resource('ECL model', body.modelId);
    }

    const model = rowToModel(modelRow as ECLTranslationModelRow);

    // Check model status
    if (model.status !== 'ready') {
      return NextResponse.json(
        {
          error: {
            error_code: 'ECL_MODEL_NOT_READY',
            message: `ECL model is not ready (status: ${model.status})`,
            hint:
              model.status === 'pending'
                ? 'Train the model first using POST /api/ecl/train?action=start'
                : model.status === 'training'
                  ? 'Wait for training to complete'
                  : 'Check model error message',
          },
        },
        { status: 400 }
      );
    }

    // Load translator
    const translator = await loadTranslator(body.modelId);

    // Validate input dimensions
    for (let i = 0; i < body.vectors.length; i++) {
      if (body.vectors[i].length !== model.sourceDim) {
        return ValidationErrors.invalidField(
          `vectors[${i}]`,
          `dimension mismatch: expected ${model.sourceDim}, got ${body.vectors[i].length}`
        );
      }
    }

    // Translate vectors
    const translatedVectors = translator.translateBatch(body.vectors);

    const latencyMs = Date.now() - startTime;

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/translate', method: 'POST', startTime },
      200,
      { embedding: body.vectors.length * model.sourceDim } // Approximate usage
    );

    return NextResponse.json({
      success: true,
      translatedVectors,
      modelId: body.modelId,
      sourceModel: model.sourceModel,
      targetModel: model.targetModel,
      count: translatedVectors.length,
      latencyMs,
    });
  } catch (error) {
    console.error('ECL translate error:', error);
    return ServerErrors.internal('ecl_translate');
  }
}

// ============================================
// GET /api/ecl/translate - Auto-select model and translate
// ============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse parameters
    const sourceModel = searchParams.get('source_model');
    const targetModel = searchParams.get('target_model');
    const vectorParam = searchParams.get('vector');

    if (!sourceModel) {
      return ValidationErrors.missingField('source_model');
    }
    if (!targetModel) {
      return ValidationErrors.missingField('target_model');
    }
    if (!vectorParam) {
      return ValidationErrors.missingField('vector');
    }

    // Parse vector from JSON string
    let vector: number[];
    try {
      vector = JSON.parse(vectorParam);
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error('Invalid vector format');
      }
    } catch {
      return ValidationErrors.invalidFormat('vector', 'JSON array of numbers');
    }

    // Auto-select best model for this pair
    const translator = await getTranslatorForModels(userId, sourceModel, targetModel);

    if (!translator) {
      return NextResponse.json(
        {
          error: {
            error_code: 'ECL_MODEL_NOT_FOUND',
            message: `No trained ECL model found for ${sourceModel} -> ${targetModel}`,
            hint: 'Create and train an ECL model for this model pair first',
          },
        },
        { status: 404 }
      );
    }

    // Validate dimension
    if (vector.length !== translator.sourceDim) {
      return ValidationErrors.invalidField(
        'vector',
        `dimension mismatch: expected ${translator.sourceDim}, got ${vector.length}`
      );
    }

    // Translate
    const translatedVector = translator.translateQuery(vector);
    const latencyMs = Date.now() - startTime;

    await logRequest(
      { userId, keyId, endpoint: '/api/ecl/translate', method: 'GET', startTime },
      200,
      { embedding: vector.length }
    );

    return NextResponse.json({
      success: true,
      translatedVector,
      modelId: translator.getModelInfo().id,
      sourceModel,
      targetModel,
      quality: translator.quality,
      latencyMs,
    });
  } catch (error) {
    console.error('ECL auto-translate error:', error);
    return ServerErrors.internal('ecl_auto_translate');
  }
}

// ============================================
// Check ECL availability
// ============================================

export async function HEAD(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return new NextResponse(null, { status: 401 });
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    const sourceModel = searchParams.get('source_model');
    const targetModel = searchParams.get('target_model');

    if (!sourceModel || !targetModel) {
      return new NextResponse(null, { status: 400 });
    }

    // Check if translator exists
    const translator = await getTranslatorForModels(userId, sourceModel, targetModel);

    if (translator) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'X-ECL-Model-Id': translator.getModelInfo().id,
          'X-ECL-Quality-RMSE': translator.quality.rmse?.toString() ?? 'N/A',
        },
      });
    }

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
