import { describe, expect, it } from 'vitest';
import { createStoryHealthChartPng } from './chart-png';

describe('post-mortem chart png', () => {
  it('renders a valid png buffer for story health trends', () => {
    const buffer = createStoryHealthChartPng([
      {
        act: 'Act I',
        snapshotDate: '2026-04-20',
        consistencyScore: 88,
        canonDensity: 1.5,
        contradictionRate: 0.2,
        engagementProxy: 42,
      },
      {
        act: 'Act II',
        snapshotDate: '2026-04-21',
        consistencyScore: 74,
        canonDensity: 3,
        contradictionRate: 0.5,
        engagementProxy: 38,
      },
    ]);

    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buffer.length).toBeGreaterThan(100);
  });
});
