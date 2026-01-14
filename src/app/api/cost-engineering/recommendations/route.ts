/**
 * Cost Engineering Recommendations API
 *
 * GET /api/cost-engineering/recommendations
 *
 * Returns pending optimization recommendations based on usage analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createCostEngineering } from '@/lib/cost-engineering';
import type { RecommendationType, ImpactLevel } from '@/lib/cost-engineering';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId, rateLimitHeaders } = authResult;

  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id') || undefined;
    const typeFilter = searchParams.get('type') as RecommendationType | null;
    const impactFilter = searchParams.get('impact') as ImpactLevel | null;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const validTypes: RecommendationType[] = ['caching', 'tiering', 'query_optimization', 'model_selection'];

    if (typeFilter && !validTypes.includes(typeFilter)) {
      return ValidationErrors.invalidValue('type', typeFilter, 'one of: ' + validTypes.join(', '));
    }

    const validImpacts: ImpactLevel[] = ['low', 'medium', 'high'];

    if (impactFilter && !validImpacts.includes(impactFilter)) {
      return ValidationErrors.invalidValue('impact', impactFilter, 'one of: ' + validImpacts.join(', '));
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return ValidationErrors.invalidField('limit', 'must be between 1 and 100');
    }

    const { autopilot, analytics } = createCostEngineering(userId);

    let recommendations = await autopilot.getPendingRecommendations(collectionId);

    if (typeFilter) {
      recommendations = recommendations.filter((r) => r.type === typeFilter);
    }

    if (impactFilter) {
      recommendations = recommendations.filter((r) => r.impact === impactFilter);
    }

    const impactOrder: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1 };

    recommendations.sort((a, b) => {
      const impactDiff = impactOrder[b.impact] - impactOrder[a.impact];
      if (impactDiff !== 0) return impactDiff;
      return b.estimatedSavingsUsd - a.estimatedSavingsUsd;
    });

    recommendations = recommendations.slice(0, limit);

    const opportunities = await analytics.identifyOpportunities(collectionId);

    await logRequest({ userId, keyId, endpoint: '/api/cost-engineering/recommendations', method: 'GET', startTime }, 200);

    const response = NextResponse.json({
      success: true,
      data: {
        total: recommendations.length,
        recommendations: recommendations.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          impact_level: r.impact,
          estimated_savings_usd: r.estimatedSavingsUsd,
          confidence: r.confidence,
          action: r.action ? { type: r.action.type, target: r.action.target, params: r.action.params } : null,
          created_at: r.createdAt,
          applied_at: r.appliedAt,
        })),
        opportunities: opportunities,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    console.error('Cost engineering recommendations error:', error);
    await logRequest({ userId, keyId, endpoint: '/api/cost-engineering/recommendations', method: 'GET', startTime }, 500);
    return ServerErrors.internal('cost_engineering_recommendations');
  }
}
