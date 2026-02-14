import { describe, it, expect } from 'vitest';
import { extractCheckSuiteHeadBranch, extractCheckSuitePRNumbers } from '../github-webhook';

describe('autopilot github webhook helpers', () => {
  it('extracts PR numbers from a check_suite payload (deduped)', () => {
    const checkSuite: Record<string, unknown> = {
      pull_requests: [
        { number: 12 },
        { number: 12 },
        { number: 13 },
        { number: '14' },
        null,
        {},
      ],
    };

    expect(extractCheckSuitePRNumbers(checkSuite)).toEqual([12, 13]);
  });

  it('extracts head_branch when present', () => {
    const checkSuite: Record<string, unknown> = {
      head_branch: 'feature/autopilot-123',
      head_sha: 'deadbeef',
    };

    expect(extractCheckSuiteHeadBranch(checkSuite)).toBe('feature/autopilot-123');
  });

  it('returns null when head_branch is missing/blank', () => {
    expect(extractCheckSuiteHeadBranch({})).toBeNull();
    expect(extractCheckSuiteHeadBranch({ head_branch: '' })).toBeNull();
    expect(extractCheckSuiteHeadBranch({ head_branch: '   ' })).toBeNull();
  });
});

