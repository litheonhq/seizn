import { describe, expect, it } from "vitest";
import { buildDashboardOverviewState } from "@/lib/dashboard-overview";
import type { DashboardStats, DashboardUser } from "@/types/dashboard";

const user: DashboardUser = {
  id: "user_1",
  email: "author@example.com",
  name: null,
};

const stats: DashboardStats = {
  memories: {
    count: 42,
    limit: 1000,
    percentage: 4.2,
  },
  apiCalls: {
    today: 12,
    limit: 100,
    percentage: 12,
  },
  keys: 1,
  plan: "pro",
  planDisplay: "Pro",
};

describe("buildDashboardOverviewState", () => {
  it("normalizes paid workspace, API, and billing cards", () => {
    const overview = buildDashboardOverviewState({
      user,
      stats,
      recentActivity: [
        {
          id: "evt_1",
          endpoint: "/v1/memories",
          method: "POST",
          status: 200,
          statusCategory: "success",
          latencyMs: 91,
          costCents: 0,
          keyPrefix: "szn_123",
          timestamp: "2026-05-10T00:00:00Z",
          tokens: 12,
        },
      ],
      recentMemories: [],
      dailyUsage: [],
      track2Enabled: true,
    });

    expect(overview.userLabel).toBe("author");
    expect(overview.planLabel).toBe("Pro");
    expect(overview.hasApiKeys).toBe(true);
    expect(overview.cards.map((card) => [card.id, card.status])).toEqual([
      ["memory", "done"],
      ["review", "attention"],
      ["track1", "done"],
      ["track2", "done"],
    ]);
    expect(overview.setup.find((step) => step.id === "billing")?.href).toBe("/dashboard/billing");
    expect(overview.setup.find((step) => step.id === "api")?.cta).toBe("Manage keys");
  });

  it("marks Track 2 as blocked when the feature is disabled", () => {
    const overview = buildDashboardOverviewState({
      user,
      stats: {
        ...stats,
        keys: 0,
        planDisplay: "Free",
      },
      track2Enabled: false,
    });

    expect(overview.hasApiKeys).toBe(false);
    expect(overview.track2Enabled).toBe(false);
    expect(overview.setup.find((step) => step.id === "api")?.status).toBe("blocked");
    expect(overview.cards.find((card) => card.id === "track2")?.status).toBe("blocked");
  });
});
