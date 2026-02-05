/**
 * Ingestion Settings API
 *
 * GET /api/spring/ingestion/settings - Get user's ingestion settings
 * PATCH /api/spring/ingestion/settings - Update ingestion settings
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createIngestionService } from '@/lib/spring/memory-v4/ingestion-service';
import type { IngestionSettingsInput, StrictnessLevel } from '@/lib/spring/memory-v4/types';

// =============================================================================
// GET - Get Ingestion Settings
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createIngestionService(supabase);
    const settings = await service.getSettings(userId);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/ingestion/settings', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      settings: {
        autoSaveEnabled: settings.autoSaveEnabled,
        candidateModeEnabled: settings.candidateModeEnabled,
        defaultConfidenceThreshold: settings.defaultConfidenceThreshold,
        strictness: settings.strictness,
        blockedCategories: settings.blockedCategories,
        blockedPatterns: settings.blockedPatterns,
        sensitiveCapsuleEnabled: settings.sensitiveCapsuleEnabled,
        sensitiveCategories: settings.sensitiveCategories,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get ingestion settings error:', error);
    return ServerErrors.internal('get_ingestion_settings');
  }
}

// =============================================================================
// PATCH - Update Ingestion Settings
// =============================================================================

export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Build input
    const input: IngestionSettingsInput = {};

    if (body.autoSaveEnabled !== undefined) {
      if (typeof body.autoSaveEnabled !== 'boolean') {
        return ValidationErrors.invalidField('autoSaveEnabled', 'must be a boolean');
      }
      input.autoSaveEnabled = body.autoSaveEnabled;
    }

    if (body.candidateModeEnabled !== undefined) {
      if (typeof body.candidateModeEnabled !== 'boolean') {
        return ValidationErrors.invalidField('candidateModeEnabled', 'must be a boolean');
      }
      input.candidateModeEnabled = body.candidateModeEnabled;
    }

    if (body.defaultConfidenceThreshold !== undefined) {
      const threshold = Number(body.defaultConfidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return ValidationErrors.invalidField('defaultConfidenceThreshold', 'must be between 0 and 1');
      }
      input.defaultConfidenceThreshold = threshold;
    }

    if (body.strictness !== undefined) {
      const validStrictness = ['low', 'medium', 'high', 'very_high'];
      if (!validStrictness.includes(body.strictness as string)) {
        return ValidationErrors.invalidValue('strictness', body.strictness, validStrictness.join(', '));
      }
      input.strictness = body.strictness as StrictnessLevel;
    }

    if (body.blockedCategories !== undefined) {
      if (!Array.isArray(body.blockedCategories)) {
        return ValidationErrors.invalidField('blockedCategories', 'must be an array');
      }
      input.blockedCategories = body.blockedCategories as string[];
    }

    if (body.blockedPatterns !== undefined) {
      if (!Array.isArray(body.blockedPatterns)) {
        return ValidationErrors.invalidField('blockedPatterns', 'must be an array');
      }
      input.blockedPatterns = body.blockedPatterns as string[];
    }

    if (body.sensitiveCapsuleEnabled !== undefined) {
      if (typeof body.sensitiveCapsuleEnabled !== 'boolean') {
        return ValidationErrors.invalidField('sensitiveCapsuleEnabled', 'must be a boolean');
      }
      input.sensitiveCapsuleEnabled = body.sensitiveCapsuleEnabled;
    }

    if (body.sensitiveCategories !== undefined) {
      if (!Array.isArray(body.sensitiveCategories)) {
        return ValidationErrors.invalidField('sensitiveCategories', 'must be an array');
      }
      input.sensitiveCategories = body.sensitiveCategories as string[];
    }

    const supabase = createServerClient();
    const service = createIngestionService(supabase);
    const settings = await service.updateSettings(userId, input);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/ingestion/settings', method: 'PATCH', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      settings: {
        autoSaveEnabled: settings.autoSaveEnabled,
        candidateModeEnabled: settings.candidateModeEnabled,
        defaultConfidenceThreshold: settings.defaultConfidenceThreshold,
        strictness: settings.strictness,
        blockedCategories: settings.blockedCategories,
        blockedPatterns: settings.blockedPatterns,
        sensitiveCapsuleEnabled: settings.sensitiveCapsuleEnabled,
        sensitiveCategories: settings.sensitiveCategories,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Update ingestion settings error:', error);
    return ServerErrors.internal('update_ingestion_settings');
  }
}
