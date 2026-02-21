import { describe, expect, it } from 'vitest';
import { assessMemoryQualitySignals } from './eval-automation';

describe('assessMemoryQualitySignals', () => {
  it('emits both reasons when thresholds are exceeded', () => {
    const feedbackRows = Array.from({ length: 30 }, (_, i) => ({
      reward: i < 14 ? -1 : 0.4,
      namespace: 'default',
    }));
    const routerRows = [
      { namespace: 'default', total_queries: 40, total_zero_results: 20 },
    ];

    const result = assessMemoryQualitySignals({
      feedbackRows,
      routerRows,
      minFeedbackEvents: 20,
      negativeRatioThreshold: 0.35,
      minRouterSamples: 30,
      zeroResultRatioThreshold: 0.4,
      lookbackHours: 6,
    });

    expect(result.reasons).toContain('negative_feedback_ratio');
    expect(result.reasons).toContain('router_zero_result_ratio');
    expect(result.summary.feedbackCount).toBe(30);
    expect(result.summary.routerQueryCount).toBe(40);
  });

  it('returns no reasons when signals are healthy', () => {
    const result = assessMemoryQualitySignals({
      feedbackRows: [{ reward: 0.2, namespace: 'default' }, { reward: 0.3, namespace: 'default' }],
      routerRows: [{ namespace: 'default', total_queries: 50, total_zero_results: 3 }],
      minFeedbackEvents: 20,
      negativeRatioThreshold: 0.35,
      minRouterSamples: 30,
      zeroResultRatioThreshold: 0.4,
      lookbackHours: 6,
    });

    expect(result.reasons).toEqual([]);
    expect(result.summary.negativeFeedbackRatio).toBe(0);
  });
});
