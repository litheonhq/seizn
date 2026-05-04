"use client";

import { BarChart3 } from "lucide-react";
import type { AuthorSettingsCopy, UsageState } from "./author-settings-types";
import { formatTokenCount, getUsagePercent } from "./author-settings-types";

interface UsageSectionProps {
  usage: UsageState;
  requestCount: number;
  copy: AuthorSettingsCopy["usage"];
}

export function UsageSection({ usage, requestCount, copy }: UsageSectionProps) {
  const used = usage.tokens_used_month ?? 0;
  const cap = usage.tokens_cap_month ?? null;
  const percent = getUsagePercent(used, cap);
  const unlimited = usage.byok_active || cap === null;

  return (
    <section className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5" aria-labelledby="author-settings-usage">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[var(--ink-900)]" aria-hidden="true" />
        <h2 id="author-settings-usage" className="text-lg font-semibold text-[var(--ink-900)]">
          {copy.title}
        </h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">{copy.description}</p>

      <div className="mt-5 rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.monthlyTokens}</p>
            <p className="mt-1 text-3xl font-semibold text-[var(--ink-900)]">{formatTokenCount(used)}</p>
          </div>
          <p className="text-sm font-medium text-[var(--ink-600)]">
            {unlimited ? copy.unlimitedByok : `${copy.of} ${formatTokenCount(cap ?? 0)}`}
          </p>
        </div>
        {!unlimited ? (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--ink-50)]" aria-label={`${percent}%`}>
            <div className="h-full rounded-full bg-[var(--ink-900)]" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.requests}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{requestCount.toLocaleString("en")}</dd>
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.overage}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {formatTokenCount(usage.overage_tokens ?? 0)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
