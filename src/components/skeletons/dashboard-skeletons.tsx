import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton, StatCardSkeleton, ChartSkeleton } from '@/components/ui/skeleton';
import { MemoryCardSkeleton } from './memory-skeletons';

/**
 * Dashboard Page Skeleton
 *
 * Full dashboard layout skeleton.
 */
export const DashboardPageSkeleton = memo(function DashboardPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <ChartSkeleton type="bar" className="h-64" />
        </div>

        {/* Activity List */}
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-28" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Memories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MemoryCardSkeleton />
          <MemoryCardSkeleton />
          <MemoryCardSkeleton />
        </div>
      </div>
    </div>
  );
});

/**
 * Analytics Page Skeleton
 */
export const AnalyticsPageSkeleton = memo(function AnalyticsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <ChartSkeleton type="line" className="h-72" />
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          <ChartSkeleton type="bar" className="h-72" />
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
              <Skeleton className="h-4 w-32" />
              <div className="flex-1">
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Settings Page Skeleton
 */
export const SettingsPageSkeleton = memo(function SettingsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
    </div>
  );
});

/**
 * Usage Page Skeleton
 */
export const UsagePageSkeleton = memo(function UsagePageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Current Usage */}
      <div className="rounded-lg border p-6 space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </div>

      {/* Usage History Chart */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>
        <ChartSkeleton type="line" className="h-64" />
      </div>

      {/* Breakdown */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center">
            <ChartSkeleton type="pie" />
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Keys Page Skeleton (API Keys)
 */
export const KeysPageSkeleton = memo(function KeysPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Keys List */}
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Budget Page Skeleton
 */
export const BudgetPageSkeleton = memo(function BudgetPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Budget Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Budget Limits */}
      <div className="rounded-lg border p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-2 w-32 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Cost Chart */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        <ChartSkeleton type="line" className="h-64" />
      </div>
    </div>
  );
});

/**
 * Autopilot Page Skeleton
 */
export const AutopilotPageSkeleton = memo(function AutopilotPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-10 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Rules/Automation List */}
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Activity Log */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Calculator Page Skeleton
 */
export const CalculatorPageSkeleton = memo(function CalculatorPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Calculator Form */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-6">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        {/* Results */}
        <div className="rounded-lg border p-6 space-y-6">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          <ChartSkeleton type="bar" className="h-48" />
        </div>
      </div>
    </div>
  );
});

/**
 * Evals Page Skeleton
 */
export const EvalsPageSkeleton = memo(function EvalsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Evals Table */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-40 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Governance Page Skeleton
 */
export const GovernancePageSkeleton = memo(function GovernancePageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Policy Cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="space-y-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Integrations Page Skeleton
 */
export const IntegrationsPageSkeleton = memo(function IntegrationsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Search/Filter */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1 max-w-md rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>

      {/* Integration Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Organizations Page Skeleton
 */
export const OrganizationsPageSkeleton = memo(function OrganizationsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Organization Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Playground Page Skeleton
 */
export const PlaygroundPageSkeleton = memo(function PlaygroundPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>

      {/* Main Playground Area */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Panel */}
        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <Skeleton className="h-48 w-full rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </div>

        {/* Output Panel */}
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-48 w-full rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </div>

      {/* Config Bar */}
      <div className="rounded-lg border p-4 flex items-center gap-4">
        <Skeleton className="h-10 w-40 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </div>
  );
});

/**
 * Webhooks Page Skeleton
 */
export const WebhooksPageSkeleton = memo(function WebhooksPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Webhooks List */}
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * DevTools Page Skeleton
 */
export const DevToolsPageSkeleton = memo(function DevToolsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header / Toolbar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-t-md" />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Request Panel */}
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>

        {/* Response Panel */}
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>

        {/* Metrics Panel */}
        <div className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </div>
  );
});

/**
 * Policy Marketplace Page Skeleton
 */
export const PolicyMarketplacePageSkeleton = memo(function PolicyMarketplacePageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Search/Filter */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1 max-w-lg rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>

      {/* Policy Pack Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Security Page Skeleton
 */
export const SecurityPageSkeleton = memo(function SecurityPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Security Score */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Audit Log */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Reports Page Skeleton
 */
export const ReportsPageSkeleton = memo(function ReportsPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>

      {/* ROI Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <ChartSkeleton type="line" className="h-64" />
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          <ChartSkeleton type="bar" className="h-64" />
        </div>
      </div>

      {/* Summary Table */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Reranker Page Skeleton
 */
export const RerankerPageSkeleton = memo(function RerankerPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Config Section */}
      <div className="rounded-lg border p-6 space-y-6">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>

      {/* Model Comparison */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Test Results */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        <ChartSkeleton type="bar" className="h-48" />
      </div>
    </div>
  );
});

/**
 * Enterprise Page Skeleton
 */
export const EnterprisePageSkeleton = memo(function EnterprisePageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* SSO Section */}
      <div className="rounded-lg border p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* SCIM Section */}
      <div className="rounded-lg border p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="rounded-lg border p-6 space-y-6">
        <Skeleton className="h-5 w-44" />
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Privacy Page Skeleton
 */
export const PrivacyPageSkeleton = memo(function PrivacyPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Privacy Settings Sections */}
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Data Management */}
      <div className="rounded-lg border p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
    </div>
  );
});
