/**
 * Autopilot Retrieval Config API
 *
 * GET  - Get autopilot config for current user
 * POST - Create/update autopilot config
 * DELETE - Delete autopilot config
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getOrCreateConfig,
  updateConfig,
  deleteConfig,
  resetLearning,
} from '@/lib/autopilot-retrieval';
import type { AutopilotConfigInput } from '@/lib/autopilot-retrieval';

// Helper to check if auth result is an error
function _isAuthErrorResult(result: unknown): result is { authError: { code: string; error: string; status: number } } {
  return typeof result === 'object' && result !== null && 'authError' in result;
}

/**
 * GET /api/autopilot/config
 *
 * Get autopilot config for the authenticated user.
 * Query params:
 * - collection_id: (optional) Get collection-specific config
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id');

    const config = await getOrCreateConfig(userId, collectionId);

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error('Autopilot config GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/autopilot/config
 *
 * Create or update autopilot config.
 * Body:
 * {
 *   "collection_id"?: string,     // Optional: for collection-specific config
 *   "enabled"?: boolean,          // Enable/disable autopilot
 *   "mode"?: "conservative" | "balanced" | "aggressive" | "experimental",
 *   "max_latency_ms"?: number,    // Maximum acceptable latency
 *   "max_cost_per_query"?: number, // Maximum cost per query
 *   "min_relevance_threshold"?: number, // Minimum relevance to consider success
 *   "exploration_rate"?: number,  // Epsilon for exploration (0-1)
 *   "learning_rate"?: number,     // Learning rate for weight updates
 *   "min_samples_before_learning"?: number, // Samples before learning starts
 *   "use_thompson_sampling"?: boolean, // Use Thompson Sampling vs UCB
 *   "decay_factor"?: number,      // Reward decay factor
 *   "reset_learning"?: boolean    // Reset all learning data
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

    // Get or create config first
    const collectionId = body?.collection_id || null;
    let config = await getOrCreateConfig(userId, collectionId);

    // Handle reset learning request
    if (body?.reset_learning === true) {
      await resetLearning(config.id);
      config = await getOrCreateConfig(userId, collectionId);
      return NextResponse.json({
        success: true,
        message: 'Learning data reset successfully',
        config,
      });
    }

    // Build update object
    const updates: AutopilotConfigInput = {};

    if (body?.enabled !== undefined) {
      updates.enabled = Boolean(body.enabled);
    }

    if (body?.mode !== undefined) {
      const validModes = ['conservative', 'balanced', 'aggressive', 'experimental'];
      if (!validModes.includes(body.mode)) {
        return NextResponse.json(
          { error: `Invalid mode. Must be one of: ${validModes.join(', ')}` },
          { status: 400 }
        );
      }
      updates.mode = body.mode;
    }

    if (body?.max_latency_ms !== undefined) {
      const val = Number(body.max_latency_ms);
      if (isNaN(val) || val < 100 || val > 30000) {
        return NextResponse.json(
          { error: 'max_latency_ms must be between 100 and 30000' },
          { status: 400 }
        );
      }
      updates.maxLatencyMs = val;
    }

    if (body?.max_cost_per_query !== undefined) {
      const val = Number(body.max_cost_per_query);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: 'max_cost_per_query must be between 0 and 1' },
          { status: 400 }
        );
      }
      updates.maxCostPerQuery = val;
    }

    if (body?.min_relevance_threshold !== undefined) {
      const val = Number(body.min_relevance_threshold);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: 'min_relevance_threshold must be between 0 and 1' },
          { status: 400 }
        );
      }
      updates.minRelevanceThreshold = val;
    }

    if (body?.exploration_rate !== undefined) {
      const val = Number(body.exploration_rate);
      if (isNaN(val) || val < 0 || val > 0.5) {
        return NextResponse.json(
          { error: 'exploration_rate must be between 0 and 0.5' },
          { status: 400 }
        );
      }
      updates.explorationRate = val;
    }

    if (body?.learning_rate !== undefined) {
      const val = Number(body.learning_rate);
      if (isNaN(val) || val < 0.001 || val > 0.5) {
        return NextResponse.json(
          { error: 'learning_rate must be between 0.001 and 0.5' },
          { status: 400 }
        );
      }
      updates.learningRate = val;
    }

    if (body?.min_samples_before_learning !== undefined) {
      const val = Number(body.min_samples_before_learning);
      if (isNaN(val) || val < 10 || val > 10000) {
        return NextResponse.json(
          { error: 'min_samples_before_learning must be between 10 and 10000' },
          { status: 400 }
        );
      }
      updates.minSamplesBeforeLearning = val;
    }

    if (body?.use_thompson_sampling !== undefined) {
      updates.useThompsonSampling = Boolean(body.use_thompson_sampling);
    }

    if (body?.decay_factor !== undefined) {
      const val = Number(body.decay_factor);
      if (isNaN(val) || val < 0.9 || val > 1) {
        return NextResponse.json(
          { error: 'decay_factor must be between 0.9 and 1' },
          { status: 400 }
        );
      }
      updates.decayFactor = val;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      config = await updateConfig(config.id, updates);
    }

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error('Autopilot config POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/autopilot/config
 *
 * Delete autopilot config.
 * Query params:
 * - config_id: The config ID to delete
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('config_id');

    if (!configId) {
      return NextResponse.json(
        { error: 'config_id is required' },
        { status: 400 }
      );
    }

    await deleteConfig(configId);

    return NextResponse.json({
      success: true,
      message: 'Config deleted successfully',
    });
  } catch (err) {
    console.error('Autopilot config DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
