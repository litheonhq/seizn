import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  vi.resetModules();
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env.SUPABASE_URL = ORIGINAL_ENV.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY;
  vi.restoreAllMocks();
});

describe('RedTeamRunner', () => {
  it('uses in-memory persistence when Supabase service-role config is missing', async () => {
    const { RedTeamRunner } = await import('./red-team');
    const runner = new RedTeamRunner() as unknown as {
      supabase: unknown;
      saveRun: (run: Record<string, unknown>) => Promise<void>;
      saveFinding: (runId: string, finding: Record<string, unknown>) => Promise<void>;
      generateReport: (runId: string) => Promise<{
        runId: string;
        summary: { totalTests: number; successfulAttacks: number };
        findings: unknown[];
      }>;
    };

    const runId = 'run-ci-fallback';
    runner.supabase = null;

    await runner.saveRun({
      id: runId,
      organizationId: 'org-ci',
      targetEndpoint: 'function',
      status: 'completed',
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      config: { categories: ['data_extraction'], maxTests: 1 },
    });

    const report = await runner.generateReport(runId);

    expect(report.runId).toBe(runId);
    expect(report.summary.totalTests).toBe(1);
    expect(report.summary.successfulAttacks).toBe(0);
    expect(report.findings).toHaveLength(0);
  }, 10000);
});
