"use client";

import { useState, useEffect } from "react";
import { Plan, PLAN_QUOTAS } from "@/lib/spring/types";

interface UsageData {
  plan: {
    name: Plan;
    pricing: { monthly: number; yearly: number };
    quotas: typeof PLAN_QUOTAS.free;
  };
  today: {
    date: string;
    usage: {
      chat: {
        gpt4o_mini: number;
        gpt4o: number;
        gpt5: number;
        claude_sonnet: number;
        claude_opus: number;
        gemini: number;
        total_messages: number;
      };
      tokens: { input: number; output: number; total: number };
      images: { sd: number; dalle: number; total: number };
      files: number;
      video_seconds: number;
      cost_cents: number;
    };
    remaining: Record<string, number>;
    percentage: Record<string, number>;
  };
  period: {
    days: number;
    stats: {
      total_messages: number;
      total_tokens: number;
      total_images: number;
      total_files: number;
      total_cost_cents: number;
      avg_daily_messages: number;
      avg_daily_cost_cents: number;
    };
    history?: Array<{
      date: string;
      chat: { total_messages: number };
      tokens: { total: number };
      images: { total: number };
      cost_cents: number;
    }>;
  };
}

export function UsageDashboard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchUsage = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/spring/usage?days=${period}&history=true`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch usage");
      }

      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error || "Failed to load usage data"}
      </div>
    );
  }

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Current plan: <span className="font-medium capitalize">{usage.plan.name}</span>
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Today&apos;s Messages"
          value={usage.today.usage.chat.total_messages}
          subtitle={`${usage.period.stats.avg_daily_messages} avg/day`}
          icon={<ChatIcon />}
          color="pink"
        />
        <SummaryCard
          title="Total Tokens"
          value={formatNumber(usage.today.usage.tokens.total)}
          subtitle={`${formatNumber(usage.period.stats.total_tokens)} this period`}
          icon={<TokenIcon />}
          color="blue"
        />
        <SummaryCard
          title="Images Generated"
          value={usage.today.usage.images.total}
          subtitle={`${usage.period.stats.total_images} this period`}
          icon={<ImageIcon />}
          color="purple"
        />
        <SummaryCard
          title="Today&apos;s Cost"
          value={formatCost(usage.today.usage.cost_cents)}
          subtitle={`${formatCost(usage.period.stats.total_cost_cents)} this period`}
          icon={<CostIcon />}
          color="green"
        />
      </div>

      {/* Quota Usage */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Today&apos;s Quota Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuotaBar
            label="GPT-4o Mini"
            used={usage.today.usage.chat.gpt4o_mini}
            limit={usage.plan.quotas.gpt4o_mini_daily}
            percentage={usage.today.percentage.gpt4o_mini}
          />
          <QuotaBar
            label="GPT-4o"
            used={usage.today.usage.chat.gpt4o}
            limit={usage.plan.quotas.gpt4o_daily}
            percentage={usage.today.percentage.gpt4o}
          />
          <QuotaBar
            label="Claude Sonnet"
            used={usage.today.usage.chat.claude_sonnet}
            limit={usage.plan.quotas.claude_sonnet_daily}
            percentage={usage.today.percentage.claude_sonnet}
          />
          <QuotaBar
            label="Gemini"
            used={usage.today.usage.chat.gemini}
            limit={usage.plan.quotas.gemini_daily}
            percentage={usage.today.percentage.gemini}
          />
          <QuotaBar
            label="SD Images"
            used={usage.today.usage.images.sd}
            limit={usage.plan.quotas.sd_images_daily}
            percentage={usage.today.percentage.sd_images}
          />
          <QuotaBar
            label="DALL-E Images"
            used={usage.today.usage.images.dalle}
            limit={usage.plan.quotas.dalle_images_daily}
            percentage={usage.today.percentage.dalle_images}
          />
          <QuotaBar
            label="Files Analyzed"
            used={usage.today.usage.files}
            limit={usage.plan.quotas.files_daily}
            percentage={usage.today.percentage.files}
          />
        </div>
      </div>

      {/* Usage History Chart */}
      {usage.period.history && usage.period.history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage History</h2>
          <div className="h-64">
            <SimpleBarChart data={usage.period.history} />
          </div>
        </div>
      )}

      {/* Detailed Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Model Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 font-medium text-gray-500">Model</th>
                <th className="text-right py-2 px-4 font-medium text-gray-500">Today</th>
                <th className="text-right py-2 px-4 font-medium text-gray-500">Remaining</th>
                <th className="text-right py-2 px-4 font-medium text-gray-500">Daily Limit</th>
              </tr>
            </thead>
            <tbody>
              <ModelRow
                name="GPT-4o Mini"
                used={usage.today.usage.chat.gpt4o_mini}
                remaining={usage.today.remaining.gpt4o_mini}
                limit={usage.plan.quotas.gpt4o_mini_daily}
              />
              <ModelRow
                name="GPT-4o"
                used={usage.today.usage.chat.gpt4o}
                remaining={usage.today.remaining.gpt4o}
                limit={usage.plan.quotas.gpt4o_daily}
              />
              <ModelRow
                name="GPT-5"
                used={usage.today.usage.chat.gpt5}
                remaining={usage.today.remaining.gpt5}
                limit={usage.plan.quotas.gpt5_daily}
              />
              <ModelRow
                name="Claude Sonnet"
                used={usage.today.usage.chat.claude_sonnet}
                remaining={usage.today.remaining.claude_sonnet}
                limit={usage.plan.quotas.claude_sonnet_daily}
              />
              <ModelRow
                name="Claude Opus"
                used={usage.today.usage.chat.claude_opus}
                remaining={usage.today.remaining.claude_opus}
                limit={usage.plan.quotas.claude_opus_daily}
              />
              <ModelRow
                name="Gemini"
                used={usage.today.usage.chat.gemini}
                remaining={usage.today.remaining.gemini}
                limit={usage.plan.quotas.gemini_daily}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: "pink" | "blue" | "purple" | "green";
}) {
  const colors = {
    pink: "bg-pink-50 text-pink-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    green: "bg-green-50 text-green-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-400">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  percentage,
}: {
  label: string;
  used: number;
  limit: number;
  percentage: number;
}) {
  const isUnlimited = limit === -1;
  const isDisabled = limit === 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">
          {isUnlimited ? `${used} / Unlimited` : isDisabled ? "Not available" : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            percentage >= 90
              ? "bg-red-500"
              : percentage >= 70
              ? "bg-amber-500"
              : "bg-gradient-to-r from-pink-500 to-rose-500"
          }`}
          style={{ width: `${isUnlimited || isDisabled ? 0 : percentage}%` }}
        />
      </div>
    </div>
  );
}

function ModelRow({
  name,
  used,
  remaining,
  limit,
}: {
  name: string;
  used: number;
  remaining: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const isDisabled = limit === 0;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 px-4 text-gray-900">{name}</td>
      <td className="py-2 px-4 text-right text-gray-900">{used}</td>
      <td className="py-2 px-4 text-right">
        {isUnlimited ? (
          <span className="text-green-600">Unlimited</span>
        ) : isDisabled ? (
          <span className="text-gray-400">N/A</span>
        ) : remaining > 0 ? (
          <span className="text-green-600">{remaining}</span>
        ) : (
          <span className="text-red-600">0</span>
        )}
      </td>
      <td className="py-2 px-4 text-right text-gray-500">
        {isUnlimited ? "Unlimited" : isDisabled ? "-" : limit}
      </td>
    </tr>
  );
}

function SimpleBarChart({
  data,
}: {
  data: Array<{
    date: string;
    chat?: { total_messages: number };
    cost_cents: number;
  }>;
}) {
  const maxMessages = Math.max(...data.map((d) => d.chat?.total_messages || 0), 1);

  return (
    <div className="flex items-end gap-1 h-full">
      {data.slice(-14).map((day, i) => {
        const messages = day.chat?.total_messages || 0;
        const height = (messages / maxMessages) * 100;

        return (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="w-full flex-1 flex items-end">
              <div
                className="w-full bg-gradient-to-t from-pink-500 to-rose-400 rounded-t transition-all hover:from-pink-600 hover:to-rose-500"
                style={{ height: `${Math.max(height, 2)}%` }}
                title={`${day.date}: ${messages} messages`}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1 rotate-45 origin-left">
              {day.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Icons
function ChatIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function TokenIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
