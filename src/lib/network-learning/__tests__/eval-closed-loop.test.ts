import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvalRun } from '@/lib/eval/types';

vi.mock('../policy/policy-updater', () => ({
  generatePolicyRecommendations: vi.fn(),
  getPolicyUpdates: vi.fn(),
  createPolicyUpdate: vi.fn(),
  approvePolicyUpdate: vi.fn(),
  applyPolicyUpdate: vi.fn(),
}));

import {
  runEvalPolicyClosedLoop,
  type EvalPolicyClosedLoopConfig,
} from '../policy/eval-closed-loop';
import {
  generatePolicyRecommendations,
  getPolicyUpdates,
  createPolicyUpdate,
  approvePolicyUpdate,
  applyPolicyUpdate,
} from '../policy/policy-updater';

function createEvalRun(summaryOverride?: Partial<EvalRun['summary']>): EvalRun {
  return {
    id: 'run-1',
    triggerId: 'trigger-1',
    triggerType: 'policy_updated',
    organizationId: 'org-1',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: {
      totalTests: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      errors: 0,
      criticalIssues: 0,
      highIssues: 0,
      durationMs: 100,
      ...summaryOverride,
    },
    results: [],
    metadata: {},
  };
}

function buildConfig(overrides: Partial<EvalPolicyClosedLoopConfig> = {}): Partial<EvalPolicyClosedLoopConfig> {
  return {
    enabled: true,
    period: 'weekly',
    maxRecommendationsPerRun: 5,
    minCreateConfidence: 0.8,
    minApproveConfidence: 0.85,
    minAutoApplyConfidence: 0.9,
    autoApprove: true,
    autoApply: false,
    requirePassingEvalForGeneration: false,
    requirePassingEvalForAutoApply: true,
    ...overrides,
  };
}

describe('runEvalPolicyClosedLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when disabled', async () => {
    const result = await runEvalPolicyClosedLoop(createEvalRun(), buildConfig({ enabled: false }));
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('closed_loop_disabled');
    expect(result.createdUpdates).toBe(0);
  });

  it('creates, approves, and applies high-confidence updates', async () => {
    vi.mocked(generatePolicyRecommendations).mockResolvedValue([
      {
        targetPolicy: 'planner.latency_budget',
        changes: { max_latency_ms: 1800 },
        rationale: 'latency trend',
        confidence: 0.95,
        basedOnInsights: ['insight_1'],
      },
    ]);

    vi.mocked(getPolicyUpdates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(createPolicyUpdate).mockResolvedValue({
      id: 'pu_1',
      targetPolicy: 'planner.latency_budget',
      changes: { max_latency_ms: 1800 },
      basedOnInsights: ['insight_1'],
      confidence: 0.95,
      status: 'pending',
    });

    vi.mocked(approvePolicyUpdate).mockResolvedValue({
      id: 'pu_1',
      targetPolicy: 'planner.latency_budget',
      changes: { max_latency_ms: 1800 },
      basedOnInsights: ['insight_1'],
      confidence: 0.95,
      status: 'approved',
    });

    vi.mocked(applyPolicyUpdate).mockResolvedValue({
      applied: true,
      update: {
        id: 'pu_1',
        targetPolicy: 'planner.latency_budget',
        changes: { max_latency_ms: 1800 },
        basedOnInsights: ['insight_1'],
        confidence: 0.95,
        status: 'applied',
      },
    });

    const result = await runEvalPolicyClosedLoop(
      createEvalRun(),
      buildConfig({ autoApply: true })
    );

    expect(result.skipped).toBe(false);
    expect(result.createdUpdates).toBe(1);
    expect(result.approvedUpdates).toBe(1);
    expect(result.appliedUpdates).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('skips duplicate recommendation updates', async () => {
    vi.mocked(generatePolicyRecommendations).mockResolvedValue([
      {
        targetPolicy: 'planner.rerank_config',
        changes: { enable_rerank: true, rerank_top_k: 10 },
        rationale: 'rerank trend',
        confidence: 0.9,
        basedOnInsights: ['insight_2'],
      },
    ]);

    vi.mocked(getPolicyUpdates)
      .mockResolvedValueOnce([
        {
          id: 'pu_existing',
          targetPolicy: 'planner.rerank_config',
          changes: { enable_rerank: true, rerank_top_k: 10 },
          basedOnInsights: ['insight_2'],
          confidence: 0.9,
          status: 'pending',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runEvalPolicyClosedLoop(createEvalRun(), buildConfig());

    expect(result.skipped).toBe(false);
    expect(result.duplicateUpdates).toBe(1);
    expect(result.createdUpdates).toBe(0);
    expect(createPolicyUpdate).not.toHaveBeenCalled();
  });
});

