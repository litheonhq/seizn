import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getAdapterForUser,
  updateAdapterStatus,
  updateAdapterWeights,
  trainAdapter,
  createTrainingRun,
  completeTrainingRun,
  failTrainingRun,
  getTrainingRun,
  listTrainingRuns,
  getSignalsForTraining,
  DEFAULT_LORA_CONFIG,
} from '@/lib/domain-adapter';
import type { LoRAConfig, TrainingProgress, TrainingMetrics } from '@/lib/domain-adapter';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// POST /api/adapters/[id]/train - Start training
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Check adapter exists and belongs to user
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/train`, method: 'POST', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Check if already training
    if (adapter.status === 'training') {
      return NextResponse.json(
        { error: 'Adapter is already training' },
        { status: 409 }
      );
    }

    // Get signals for training
    const signals = await getSignalsForTraining(id);

    if (signals.length === 0) {
      return NextResponse.json(
        { error: 'No training signals available. Record feedback before training.' },
        { status: 400 }
      );
    }

    // Parse training config from body
    const body = await request.json().catch((e: unknown) => {
      console.warn('[Adapter Train] Failed to parse request body:', e instanceof Error ? e.message : e);
      return {} as Record<string, unknown>;
    });
    const config: LoRAConfig = {
      ...DEFAULT_LORA_CONFIG,
      rank: body.rank ?? adapter.adapterRank ?? DEFAULT_LORA_CONFIG.rank,
      scale: body.scale ?? adapter.scale ?? DEFAULT_LORA_CONFIG.scale,
      learningRate: body.learning_rate ?? DEFAULT_LORA_CONFIG.learningRate,
      epochs: body.epochs ?? DEFAULT_LORA_CONFIG.epochs,
      batchSize: body.batch_size ?? DEFAULT_LORA_CONFIG.batchSize,
      lossMargin: body.loss_margin ?? DEFAULT_LORA_CONFIG.lossMargin,
      validationSplit: body.validation_split ?? DEFAULT_LORA_CONFIG.validationSplit,
      earlyStoppingPatience: body.early_stopping_patience ?? DEFAULT_LORA_CONFIG.earlyStoppingPatience,
    };

    // Validate config
    if (config.epochs < 1 || config.epochs > 100) {
      return NextResponse.json(
        { error: 'epochs must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (config.batchSize < 1 || config.batchSize > 256) {
      return NextResponse.json(
        { error: 'batch_size must be between 1 and 256' },
        { status: 400 }
      );
    }

    // Create training run record
    const run = await createTrainingRun(id, config);

    // Update adapter status
    await updateAdapterStatus(id, 'training');

    // Start training (async)
    const metrics: TrainingMetrics = {
      trainLoss: [],
      validationLoss: [],
      mrr: [],
      ndcg: [],
    };

    // Run training in background
    trainAdapter({
      signals,
      config,
      onProgress: (progress: TrainingProgress, m: TrainingMetrics) => {
        // Update progress in database (fire and forget)
        // In production, this would be handled by a job queue
        Object.assign(metrics, m);
      },
    })
      .then(async (result) => {
        // Update adapter with trained weights
        await updateAdapterWeights(id, result.weightsA, result.weightsB, result.mrr);

        // Complete training run
        await completeTrainingRun(run.id, result, {
          trainLoss: result.trainLoss ? [result.trainLoss] : [],
          validationLoss: result.validationLoss ? [result.validationLoss] : [],
          mrr: [result.mrr],
          ndcg: [result.ndcg],
        });

        console.log(`Training completed for adapter ${id}: MRR=${result.mrr.toFixed(4)}`);
      })
      .catch(async (err) => {
        console.error(`Training failed for adapter ${id}:`, err);
        await failTrainingRun(run.id, err.message);
        await updateAdapterStatus(id, adapter.validationMrr ? 'ready' : 'untrained');
      });

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/train`, method: 'POST', startTime },
      202
    );

    return NextResponse.json(
      {
        message: 'Training started',
        run_id: run.id,
        adapter_id: id,
        config: {
          rank: config.rank,
          scale: config.scale,
          epochs: config.epochs,
          batch_size: config.batchSize,
          learning_rate: config.learningRate,
        },
        signals_count: signals.length,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error('Start training error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// GET /api/adapters/[id]/train - Get training status/history
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Check adapter exists
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/train`, method: 'GET', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Check if requesting specific run
    const runId = searchParams.get('run_id');
    if (runId) {
      const run = await getTrainingRun(runId);
      if (!run || run.adapterId !== id) {
        return NextResponse.json({ error: 'Training run not found' }, { status: 404 });
      }

      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/train`, method: 'GET', startTime },
        200
      );

      return NextResponse.json({ run: formatTrainingRun(run) });
    }

    // List recent training runs
    const limit = parseInt(searchParams.get('limit') ?? '10', 10);
    const runs = await listTrainingRuns(id, Math.min(limit, 50));

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/train`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      adapter_status: adapter.status,
      last_trained_at: adapter.lastTrainedAt?.toISOString(),
      validation_mrr: adapter.validationMrr,
      runs: runs.map(formatTrainingRun),
    });
  } catch (err) {
    console.error('Get training status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTrainingRun(run: any) {
  return {
    id: run.id,
    adapter_id: run.adapterId,
    status: run.status,
    config: {
      rank: run.config.rank,
      scale: run.config.scale,
      epochs: run.config.epochs,
      batch_size: run.config.batchSize,
      learning_rate: run.config.learningRate,
      loss_margin: run.config.lossMargin,
    },
    progress: {
      current_epoch: run.progress.currentEpoch,
      total_epochs: run.progress.totalEpochs,
      current_step: run.progress.currentStep,
      total_steps: run.progress.totalSteps,
    },
    metrics: {
      train_loss: run.metrics.trainLoss,
      validation_loss: run.metrics.validationLoss,
      mrr: run.metrics.mrr,
      ndcg: run.metrics.ndcg,
    },
    final_mrr: run.finalMrr,
    final_ndcg: run.finalNdcg,
    error: run.error,
    started_at: run.startedAt?.toISOString(),
    completed_at: run.completedAt?.toISOString(),
    created_at: run.createdAt.toISOString(),
  };
}
