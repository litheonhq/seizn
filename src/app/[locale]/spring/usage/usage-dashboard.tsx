"use client";

import { useState, useEffect } from "react";
import type { Locale } from "@/i18n/config";
import Link from "next/link";

interface UsageDashboardProps {
  locale: Locale;
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
  };
}

interface UsageData {
  plan: {
    name: string;
    pricing: { monthly: number; yearly: number };
    quotas: Record<string, number>;
  };
  today: {
    date: string;
    usage: {
      chat: Record<string, number>;
      tokens: { input: number; output: number; total: number };
      images: { sd: number; dalle: number; total: number };
      files: number;
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
  };
}

export function UsageDashboard({ locale, user }: UsageDashboardProps) {
  const [data, setData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const res = await fetch(`/api/spring/usage?days=${selectedPeriod}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch usage:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUsage();
  }, [selectedPeriod]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Failed to load usage data</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/${locale}/spring/chat`}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">Usage Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{user.email}</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPlanBadgeColor(data.plan.name)}`}>
                {data.plan.name.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Plan Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Current Plan</h2>
            <Link
              href={`/${locale}/pricing`}
              className="text-sm text-pink-600 hover:text-pink-700 font-medium"
            >
              Upgrade Plan
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Plan"
              value={data.plan.name}
              subtext={data.plan.pricing.monthly > 0 ? `$${data.plan.pricing.monthly}/mo` : "Free"}
            />
            <StatCard
              label="Today&apos;s Messages"
              value={data.today.usage.chat.total_messages}
              subtext="messages sent"
            />
            <StatCard
              label="Today&apos;s Cost"
              value={`$${(data.today.usage.cost_cents / 100).toFixed(2)}`}
              subtext="estimated"
            />
            <StatCard
              label="Period Cost"
              value={`$${(data.period.stats.total_cost_cents / 100).toFixed(2)}`}
              subtext={`last ${data.period.days} days`}
            />
          </div>
        </div>

        {/* Today's Usage */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Today&apos;s Usage</h2>
          <div className="space-y-4">
            <UsageBar
              label="GPT-4o Mini"
              used={data.today.usage.chat.gpt4o_mini}
              limit={data.plan.quotas.gpt4o_mini_daily}
              percentage={data.today.percentage.gpt4o_mini}
            />
            <UsageBar
              label="GPT-4o"
              used={data.today.usage.chat.gpt4o}
              limit={data.plan.quotas.gpt4o_daily}
              percentage={data.today.percentage.gpt4o}
            />
            <UsageBar
              label="Claude Sonnet"
              used={data.today.usage.chat.claude_sonnet}
              limit={data.plan.quotas.claude_sonnet_daily}
              percentage={data.today.percentage.claude_sonnet}
            />
            <UsageBar
              label="Gemini"
              used={data.today.usage.chat.gemini}
              limit={data.plan.quotas.gemini_daily}
              percentage={data.today.percentage.gemini}
            />
            <UsageBar
              label="SD Images"
              used={data.today.usage.images.sd}
              limit={data.plan.quotas.sd_images_daily}
              percentage={data.today.percentage.sd_images}
            />
            <UsageBar
              label="DALL-E Images"
              used={data.today.usage.images.dalle}
              limit={data.plan.quotas.dalle_images_daily}
              percentage={data.today.percentage.dalle_images}
            />
            <UsageBar
              label="Files Analyzed"
              used={data.today.usage.files}
              limit={data.plan.quotas.files_daily}
              percentage={data.today.percentage.files}
            />
          </div>
        </div>

        {/* Period Stats */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Period Statistics</h2>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Messages"
              value={data.period.stats.total_messages.toLocaleString()}
              subtext={`avg ${data.period.stats.avg_daily_messages}/day`}
            />
            <StatCard
              label="Total Tokens"
              value={formatTokens(data.period.stats.total_tokens)}
              subtext="input + output"
            />
            <StatCard
              label="Images Generated"
              value={data.period.stats.total_images}
              subtext="SD + DALL-E"
            />
            <StatCard
              label="Files Analyzed"
              value={data.period.stats.total_files}
              subtext={`${selectedPeriod} day period`}
            />
          </div>
        </div>

        {/* Token Usage */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Token Usage Today</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {formatTokens(data.today.usage.tokens.input)}
              </p>
              <p className="text-sm text-gray-600">Input Tokens</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {formatTokens(data.today.usage.tokens.output)}
              </p>
              <p className="text-sm text-gray-600">Output Tokens</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {formatTokens(data.today.usage.tokens.total)}
              </p>
              <p className="text-sm text-gray-600">Total Tokens</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ===========================================
// Components
// ===========================================
function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{subtext}</p>
    </div>
  );
}

function UsageBar({
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
  const barColor =
    percentage >= 90
      ? "bg-red-500"
      : percentage >= 70
      ? "bg-yellow-500"
      : "bg-pink-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">
          {isUnlimited
            ? `${used} / Unlimited`
            : isDisabled
            ? "Not available"
            : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        {!isDisabled && (
          <div
            className={`h-full ${isUnlimited ? "bg-green-500" : barColor} transition-all duration-300`}
            style={{ width: isUnlimited ? "20%" : `${Math.min(percentage, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================
// Helpers
// ===========================================
function getPlanBadgeColor(plan: string): string {
  switch (plan) {
    case "enterprise":
      return "bg-purple-100 text-purple-800";
    case "pro":
      return "bg-pink-100 text-pink-800";
    case "plus":
      return "bg-blue-100 text-blue-800";
    case "starter":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
