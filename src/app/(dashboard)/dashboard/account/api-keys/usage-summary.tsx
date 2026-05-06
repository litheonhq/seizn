"use client";

import { Activity, Bot, Wrench, DollarSign } from "lucide-react";
import type { UserUsageSummary } from "@/lib/api-keys";
import type { ApiKeySummary } from "./page";

interface UsageSummaryProps {
  usage: UserUsageSummary | null;
  keys: ApiKeySummary[];
}

const TOOL_LABELS: Record<string, string> = {
  recall: "Recall",
  remember: "Remember",
  graph: "Graph",
  search: "Search",
  check: "Check",
  timeline: "Timeline",
  "projects:read": "Projects (read)",
  "projects:write": "Projects (write)",
  "audit:read": "Audit log",
  managed_llm: "Managed LLM",
  unknown: "Other",
};

function formatNumber(value: number): string {
  return value.toLocaleString("en");
}

function formatUsd(milli: number): string {
  if (milli <= 0) return "$0.00";
  return `$${(milli / 1000).toFixed(2)}`;
}

function formatProviderModel(provider: string | null, model: string | null): string {
  if (provider === "anthropic") return model ?? "Anthropic";
  if (provider === "openai") return model ?? "OpenAI";
  if (provider === "google") return model ?? "Google";
  return model ?? provider ?? "Unknown";
}

export function UsageSummary({ usage, keys }: UsageSummaryProps) {
  if (!usage || keys.length === 0) return null;

  const totalQuota = keys.reduce((sum, k) => sum + k.monthlyQuota, 0);
  const usedAcrossKeys = keys.reduce((sum, k) => sum + k.used, 0);
  const overallPct = totalQuota > 0 ? Math.min(100, Math.round((usedAcrossKeys / totalQuota) * 100)) : 0;
  const hasManagedLlmCost = usage.totalCostUsdMilli > 0;

  return (
    <section
      className="rounded-lg border border-szn-border-subtle bg-szn-surface p-5 mb-6"
      aria-labelledby="track2-usage-summary"
    >
      <header className="flex flex-col gap-1 mb-5">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-szn-text-1" aria-hidden="true" />
          <h2 id="track2-usage-summary" className="font-serif text-lg text-szn-text-1">
            This month — usage
          </h2>
        </div>
        <p className="text-sm text-szn-text-2">
          Live counts pulled from <code className="font-mono text-xs">api_key_usage</code>. Period resets on the
          1st (UTC).
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          label="Total requests"
          value={formatNumber(usage.totalRequests)}
          sublabel={`${formatNumber(totalQuota)} included`}
        />
        <StatTile
          icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
          label="Managed LLM cost"
          value={hasManagedLlmCost ? formatUsd(usage.totalCostUsdMilli) : "—"}
          sublabel={hasManagedLlmCost ? "Studio Managed metered" : "BYOK / non-metered"}
        />
        <StatTile
          icon={<Wrench className="h-4 w-4" aria-hidden="true" />}
          label="Quota used"
          value={`${overallPct}%`}
          sublabel={`${formatNumber(usedAcrossKeys)} of ${formatNumber(totalQuota)}`}
        />
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-szn-bg">
        <div
          className="h-full bg-szn-accent transition-all"
          style={{ width: `${overallPct}%` }}
          aria-label={`${overallPct}% of monthly quota used`}
        />
      </div>

      {usage.byTool.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-szn-text-1">
            <Wrench className="h-4 w-4" aria-hidden="true" /> By tool
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {usage.byTool.map((row) => {
              const pct = usage.totalRequests > 0
                ? Math.round((row.count / usage.totalRequests) * 100)
                : 0;
              return (
                <li key={row.tool} className="flex items-center justify-between gap-3 rounded-md border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-szn-text-1">
                      {TOOL_LABELS[row.tool] ?? row.tool}
                    </span>
                    <span className="ml-2 text-xs text-szn-text-2">{pct}%</span>
                  </div>
                  <span className="font-mono text-szn-text-1">{formatNumber(row.count)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {usage.byModel.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-szn-text-1">
            <Bot className="h-4 w-4" aria-hidden="true" /> By model
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {usage.byModel.map((row, index) => (
              <li
                key={`${row.provider ?? '_'}-${row.model ?? '_'}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="block truncate font-medium text-szn-text-1">
                    {formatProviderModel(row.provider, row.model)}
                  </span>
                  {row.cost_usd_milli > 0 ? (
                    <span className="text-xs text-szn-text-2">{formatUsd(row.cost_usd_milli)} metered</span>
                  ) : null}
                </div>
                <span className="font-mono text-szn-text-1">{formatNumber(row.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {usage.perKey.length > 1 ? (
        <details className="mt-6 rounded-md border border-szn-border-subtle bg-szn-bg p-3">
          <summary className="cursor-pointer text-sm font-medium text-szn-text-1">
            Per-key breakdown ({usage.perKey.length} keys)
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-szn-text-2">
                <th className="px-2 py-1.5 font-medium">Key</th>
                <th className="px-2 py-1.5 font-medium text-right">Requests</th>
                <th className="px-2 py-1.5 font-medium text-right">Quota</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const breakdown = usage.perKey.find((p) => p.apiKeyId === key.id);
                const used = breakdown?.total ?? 0;
                const pct = key.monthlyQuota > 0 ? Math.round((used / key.monthlyQuota) * 100) : 0;
                return (
                  <tr key={key.id} className="border-t border-szn-border-subtle">
                    <td className="px-2 py-2 font-medium text-szn-text-1">{key.name}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatNumber(used)}</td>
                    <td className="px-2 py-2 text-right text-szn-text-2">{pct}% of {formatNumber(key.monthlyQuota)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-md border border-szn-border-subtle bg-szn-bg p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-szn-text-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-xs text-szn-text-2">{sublabel}</div>
    </div>
  );
}
