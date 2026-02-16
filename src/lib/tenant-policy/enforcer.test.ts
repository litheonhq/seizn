import { describe, expect, it } from "vitest";
import { enforceCaps, estimateSummerCost, toHttpResponse } from "./enforcer";
import { createTenantPolicy } from "./presets";
import type { TenantBudgetState, TenantPolicy } from "./types";

function makePolicy(): TenantPolicy {
  return JSON.parse(JSON.stringify(createTenantPolicy("tenant-test")));
}

function makeBudgetState(overrides: Partial<TenantBudgetState> = {}): TenantBudgetState {
  return {
    tenantId: "tenant-test",
    monthSpendCents: 0,
    daySpendCents: 0,
    monthRequests: 0,
    dayRequests: 0,
    minuteRequests: 0,
    dayChunkUpserts: 0,
    ratioMonth: 0,
    ratioDay: 0,
    lastUpdated: new Date(),
    ...overrides,
  };
}

describe("tenant-policy enforceCaps", () => {
  it("allows everything when policy mode is disabled", () => {
    const policy = makePolicy();
    policy.mode = "disabled";

    const result = enforceCaps(
      policy,
      makeBudgetState({
        minuteRequests: policy.caps.rpm + 999,
        dayRequests: policy.caps.daily_requests + 999,
      }),
      { type: "summer", estimatedCostCents: 999999 }
    );

    expect(result.action).toBe("allow");
  });

  it("denies when rpm cap is exceeded and sets retry-after", () => {
    const policy = makePolicy();
    const budget = makeBudgetState({ minuteRequests: policy.caps.rpm });

    const result = enforceCaps(policy, budget, { type: "summer" });
    expect(result.action).toBe("deny");
    expect(result.reason).toBe("rpm_exceeded");
    expect(result.retryAfter).toBe(60);

    const http = toHttpResponse(result);
    expect(http.status).toBe(429);
    expect(http.headers["Retry-After"]).toBe("60");
    expect(http.body.code).toBe("rpm_exceeded");
  });

  it("does not hard-deny in monitor mode even when caps are exceeded", () => {
    const policy = makePolicy();
    policy.mode = "monitor";

    const result = enforceCaps(
      policy,
      makeBudgetState({
        minuteRequests: policy.caps.rpm + 1,
        daySpendCents: policy.caps.daily_cost_cents + 500,
        ratioDay: 0.2,
      }),
      { type: "summer", estimatedCostCents: 1000 }
    );

    expect(result.action).not.toBe("deny");
  });

  it("applies strict cost cap behavior", () => {
    const policy = makePolicy();
    policy.caps.daily_cost_cents = 100;

    const budget = makeBudgetState({ daySpendCents: 100 });
    const relaxed = enforceCaps(policy, budget, { type: "summer", estimatedCostCents: 4 });
    const strict = enforceCaps(
      policy,
      budget,
      { type: "summer", estimatedCostCents: 4 },
      { strict: true }
    );

    expect(relaxed.action).not.toBe("deny");
    expect(strict.action).toBe("deny");
    expect(strict.reason).toBe("daily_cost_exceeded");
  });

  it("denies ingest when degrade ladder disables ingest", () => {
    const policy = makePolicy();
    policy.degrade_ladder = [
      {
        at_budget_usage_gte: 0.5,
        actions: {
          ingest: { enabled: false },
        },
      },
    ];

    const result = enforceCaps(
      policy,
      makeBudgetState({
        ratioMonth: 0.7,
        ratioDay: 0.2,
      }),
      { type: "ingest", requestBytes: 128, chunkCount: 1 }
    );

    expect(result.action).toBe("deny");
    expect(result.reason).toBe("ingest_disabled");
  });

  it("denies ingest when daily chunk upsert cap would be exceeded", () => {
    const policy = makePolicy();
    policy.ingest.daily_chunk_upserts_max = 100;

    const result = enforceCaps(
      policy,
      makeBudgetState({
        dayChunkUpserts: 95,
      }),
      {
        type: "ingest",
        chunkCount: 10,
        requestBytes: 1024,
      }
    );

    expect(result.action).toBe("deny");
    expect(result.reason).toBe("quota_exceeded");
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("allows ingest when daily chunk upsert cap is not exceeded", () => {
    const policy = makePolicy();
    policy.ingest.daily_chunk_upserts_max = 100;

    const result = enforceCaps(
      policy,
      makeBudgetState({
        dayChunkUpserts: 90,
      }),
      {
        type: "ingest",
        chunkCount: 10,
        requestBytes: 1024,
      }
    );

    expect(result.action).not.toBe("deny");
  });
});

describe("tenant-policy estimateSummerCost", () => {
  it("respects policy maxima when params exceed caps", () => {
    const policy = makePolicy();
    policy.summer.topK_max = 10;
    policy.summer.rerank_topN_max = 20;
    policy.summer.federated_enabled = true;
    policy.summer.federated_max_sources = 2;

    const cost = estimateSummerCost(policy, {
      topK: 500,
      rerank: true,
      rerankTopN: 999,
      federated: true,
      federatedSources: 999,
    });

    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });
});
