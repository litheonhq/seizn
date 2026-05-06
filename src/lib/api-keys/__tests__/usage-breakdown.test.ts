import { describe, expect, it } from 'vitest';

import { aggregateUserUsage, getApiKeyUsageBreakdown } from '../usage-breakdown';

type Row = {
  tool: string | null;
  cost_units: number | null;
  llm_cost_usd_milli: number | null;
  llm_provider: string | null;
  llm_model: string | null;
  occurred_at: string | null;
};

function makeSupabase(rows: Row[]) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                gte: async () => ({ data: rows, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

describe('getApiKeyUsageBreakdown', () => {
  it('aggregates total + tool + model + daily counts', async () => {
    const rows: Row[] = [
      { tool: 'recall', cost_units: 1, llm_cost_usd_milli: 0, llm_provider: null, llm_model: null, occurred_at: '2026-05-01T08:00:00Z' },
      { tool: 'recall', cost_units: 1, llm_cost_usd_milli: 0, llm_provider: null, llm_model: null, occurred_at: '2026-05-01T09:00:00Z' },
      { tool: 'check', cost_units: 1, llm_cost_usd_milli: 150, llm_provider: 'anthropic', llm_model: 'claude-opus-4-7', occurred_at: '2026-05-01T10:00:00Z' },
      { tool: 'check', cost_units: 1, llm_cost_usd_milli: 150, llm_provider: 'anthropic', llm_model: 'claude-opus-4-7', occurred_at: '2026-05-02T10:00:00Z' },
      { tool: 'timeline', cost_units: 2, llm_cost_usd_milli: 30, llm_provider: 'openai', llm_model: 'gpt-5.5', occurred_at: '2026-05-02T11:00:00Z' },
    ];
    const result = await getApiKeyUsageBreakdown('key-1', 'month', { supabase: makeSupabase(rows) });

    expect(result.apiKeyId).toBe('key-1');
    expect(result.total).toBe(6); // 1+1+1+1+2
    expect(result.cost_usd_milli).toBe(330); // 150+150+30

    expect(result.byTool).toEqual([
      { tool: 'recall', count: 2 },
      { tool: 'check', count: 2 },
      { tool: 'timeline', count: 2 },
    ]);

    expect(result.byModel).toHaveLength(2);
    expect(result.byModel[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      count: 2,
      cost_usd_milli: 300,
    });
    expect(result.byModel[1]).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.5',
      count: 2,
      cost_usd_milli: 30,
    });

    expect(result.daily).toEqual([
      { date: '2026-05-01', count: 3 },
      { date: '2026-05-02', count: 3 },
    ]);
  });

  it('returns zeros for an empty result set', async () => {
    const result = await getApiKeyUsageBreakdown('key-empty', 'month', { supabase: makeSupabase([]) });
    expect(result).toEqual({
      apiKeyId: 'key-empty',
      total: 0,
      cost_usd_milli: 0,
      byTool: [],
      byModel: [],
      daily: [],
    });
  });

  it('treats null tool as "unknown"', async () => {
    const result = await getApiKeyUsageBreakdown('key-1', 'month', {
      supabase: makeSupabase([
        { tool: null, cost_units: 1, llm_cost_usd_milli: 0, llm_provider: null, llm_model: null, occurred_at: '2026-05-01T00:00:00Z' },
      ]),
    });
    expect(result.byTool).toEqual([{ tool: 'unknown', count: 1 }]);
  });

  it('drops model rows where provider AND model are both null', async () => {
    const result = await getApiKeyUsageBreakdown('key-1', 'month', {
      supabase: makeSupabase([
        { tool: 'recall', cost_units: 1, llm_cost_usd_milli: 0, llm_provider: null, llm_model: null, occurred_at: '2026-05-01T00:00:00Z' },
      ]),
    });
    expect(result.byModel).toEqual([]);
  });
});

describe('aggregateUserUsage', () => {
  it('sums totals + merges tool/model maps across keys', () => {
    const summary = aggregateUserUsage([
      {
        apiKeyId: 'k1',
        total: 10,
        cost_usd_milli: 500,
        byTool: [{ tool: 'recall', count: 8 }, { tool: 'check', count: 2 }],
        byModel: [{ provider: 'anthropic', model: 'claude-opus-4-7', count: 2, cost_usd_milli: 500 }],
        daily: [],
      },
      {
        apiKeyId: 'k2',
        total: 5,
        cost_usd_milli: 100,
        byTool: [{ tool: 'recall', count: 3 }, { tool: 'timeline', count: 2 }],
        byModel: [{ provider: 'anthropic', model: 'claude-opus-4-7', count: 1, cost_usd_milli: 100 }],
        daily: [],
      },
    ]);
    expect(summary.totalRequests).toBe(15);
    expect(summary.totalCostUsdMilli).toBe(600);
    expect(summary.byTool).toEqual([
      { tool: 'recall', count: 11 },
      { tool: 'check', count: 2 },
      { tool: 'timeline', count: 2 },
    ]);
    expect(summary.byModel).toEqual([
      { provider: 'anthropic', model: 'claude-opus-4-7', count: 3, cost_usd_milli: 600 },
    ]);
  });

  it('returns zero summary for an empty input', () => {
    expect(aggregateUserUsage([])).toEqual({
      totalRequests: 0,
      totalCostUsdMilli: 0,
      byTool: [],
      byModel: [],
      perKey: [],
    });
  });
});
