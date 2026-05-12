import type {
  DailyUsage,
  DashboardStats,
  DashboardUser,
  RecentActivity,
  RecentMemory,
} from "@/types/dashboard";

export type DashboardOverviewStatus = "done" | "todo" | "blocked" | "attention";

export interface DashboardOverviewStep {
  id: "import" | "review" | "api" | "billing";
  title: string;
  detail: string;
  status: DashboardOverviewStatus;
  href: string;
  cta: string;
}

export interface DashboardOverviewCard {
  id: "memory" | "review" | "track1" | "track2";
  label: string;
  value: string;
  detail: string;
  href: string;
  cta: string;
  status: DashboardOverviewStatus;
}

export interface DashboardOverviewState {
  userLabel: string;
  planLabel: string;
  hasApiKeys: boolean;
  track2Enabled: boolean;
  setup: DashboardOverviewStep[];
  cards: DashboardOverviewCard[];
  recentMemories: RecentMemory[];
  recentActivity: RecentActivity[];
  dailyUsage: DailyUsage[];
}

export interface DashboardOverviewInput {
  user: DashboardUser;
  stats?: DashboardStats | null;
  recentMemories?: RecentMemory[] | null;
  recentActivity?: RecentActivity[] | null;
  dailyUsage?: DailyUsage[] | null;
  track2Enabled?: boolean;
}

function formatCount(value: number | null | undefined): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString("en");
}

function formatQuota(used: number, limit: number): string {
  if (limit === -1) return `${formatCount(used)} used, unlimited`;
  return `${formatCount(used)} of ${formatCount(limit)}`;
}

function userLabel(user: DashboardUser): string {
  return user.name || user.email?.split("@")[0] || "Author";
}

export function buildDashboardOverviewState(input: DashboardOverviewInput): DashboardOverviewState {
  const stats = input.stats ?? null;
  const planLabel = stats?.planDisplay || "Free";
  const memoryCount = stats?.memories.count ?? 0;
  const apiCallsToday = stats?.apiCalls.today ?? 0;
  const apiCallLimit = stats?.apiCalls.limit ?? 0;
  const keyCount = stats?.keys ?? 0;
  const hasApiKeys = keyCount > 0;
  const hasPaidPlan = planLabel.toLowerCase() !== "free";
  const recentMemories = input.recentMemories ?? [];
  const recentActivity = input.recentActivity ?? [];
  const dailyUsage = input.dailyUsage ?? [];
  const hasReviewSignal = recentActivity.length > 0 || recentMemories.length > 0;
  const track2Enabled = input.track2Enabled !== false;

  const setup: DashboardOverviewStep[] = [
    {
      id: "import",
      title: "Start a workspace",
      detail: memoryCount > 0
        ? `${formatCount(memoryCount)} memories are available.`
        : "Import a draft or open the sample workspace.",
      status: memoryCount > 0 ? "done" : "todo",
      href: "/dashboard/author?tab=inbox",
      cta: memoryCount > 0 ? "Open inbox" : "Start import",
    },
    {
      id: "review",
      title: "Review canon changes",
      detail: hasReviewSignal
        ? "Recent memory or request activity is ready to inspect."
        : "Review and conflict queues will appear here once data lands.",
      status: hasReviewSignal ? "attention" : "todo",
      href: "/dashboard/author?tab=review",
      cta: "Open review",
    },
    {
      id: "api",
      title: "Connect API and MCP",
      detail: hasApiKeys
        ? `${formatCount(keyCount)} active key${keyCount === 1 ? "" : "s"}.`
        : track2Enabled
          ? "Create a Track 2 key for REST API and MCP access."
          : "Track 2 is not enabled for this account yet.",
      status: hasApiKeys ? "done" : track2Enabled ? "todo" : "blocked",
      href: "/dashboard/account/api-keys",
      cta: hasApiKeys ? "Manage keys" : "Create key",
    },
    {
      id: "billing",
      title: "Confirm billing state",
      detail: hasPaidPlan
        ? `${planLabel} is the current workspace plan.`
        : "Free accounts should route to pricing instead of raw billing errors.",
      status: hasPaidPlan ? "done" : "todo",
      href: "/dashboard/billing",
      cta: hasPaidPlan ? "Manage billing" : "Choose plan",
    },
  ];

  const cards: DashboardOverviewCard[] = [
    {
      id: "memory",
      label: "Author Memory",
      value: formatCount(memoryCount),
      detail: stats
        ? formatQuota(memoryCount, stats.memories.limit)
        : "Waiting for memory stats.",
      href: "/dashboard/author",
      cta: "Open workspace",
      status: memoryCount > 0 ? "done" : "todo",
    },
    {
      id: "review",
      label: "Review operations",
      value: formatCount(recentActivity.length),
      detail: recentActivity.length > 0
        ? "Recent requests are available for inspection."
        : "No recent review activity yet.",
      href: "/dashboard/author?tab=review",
      cta: "Review",
      status: recentActivity.length > 0 ? "attention" : "todo",
    },
    {
      id: "track1",
      label: "Web plan",
      value: planLabel,
      detail: hasPaidPlan
        ? "Billing and usage are linked to the author workspace."
        : "Start checkout from pricing or billing without surfacing JSON errors.",
      href: "/dashboard/billing",
      cta: "Billing",
      status: hasPaidPlan ? "done" : "todo",
    },
    {
      id: "track2",
      label: "API and MCP",
      value: hasApiKeys ? `${formatCount(keyCount)} keys` : "Not connected",
      detail: track2Enabled
        ? formatQuota(apiCallsToday, apiCallLimit)
        : "Track 2 is currently disabled for this account.",
      href: "/dashboard/account/api-keys",
      cta: "API keys",
      status: hasApiKeys ? "done" : track2Enabled ? "todo" : "blocked",
    },
  ];

  return {
    userLabel: userLabel(input.user),
    planLabel,
    hasApiKeys,
    track2Enabled,
    setup,
    cards,
    recentMemories,
    recentActivity,
    dailyUsage,
  };
}
