"use client";

import { useState, useEffect, useCallback } from "react";
import type { AdapterStatus } from "@/lib/domain-adapter/types";


// =============================================================================
// Types
// =============================================================================

interface Adapter {
  id: string;
  name: string;
  description?: string;
  collection_id?: string;
  domain_type?: string;
  adapter_rank: number;
  scale: number;
  status: AdapterStatus;
  training_samples: number;
  positive_samples: number;
  negative_samples: number;
  validation_mrr?: number;
  auto_retrain: boolean;
  retrain_threshold: number;
  last_trained_at?: string;
  created_at: string;
  updated_at: string;
}

interface AdapterStats {
  total: number;
  ready: number;
  training: number;
  untrained: number;
  stale: number;
  totalSignals: number;
}

interface AdapterListProps {
  onSelect?: (adapter: Adapter) => void;
  onTrain?: (adapterId: string) => void;
  onDelete?: (adapterId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function AdapterList({ onSelect, onTrain, onDelete }: AdapterListProps) {
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [stats, setStats] = useState<AdapterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<AdapterStatus | "">("");
  const [domainFilter, setDomainFilter] = useState<string>("");

  const fetchAdapters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ include_stats: "true" });
      if (statusFilter) params.set("status", statusFilter);
      if (domainFilter) params.set("domain_type", domainFilter);

      const response = await fetch(`/api/adapters?${params}`);
      if (!response.ok) throw new Error("Failed to fetch adapters");

      const data = await response.json();
      setAdapters(data.adapters);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, domainFilter]);

  useEffect(() => {
    fetchAdapters();
  }, [fetchAdapters]);

  const handleTrain = async (adapterId: string) => {
    if (onTrain) {
      onTrain(adapterId);
    } else {
      try {
        const response = await fetch(`/api/adapters/${adapterId}/train`, {
          method: "POST",
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Training failed");
        }
        fetchAdapters();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Training failed");
      }
    }
  };

  const handleDelete = async (adapterId: string) => {
    if (!confirm("Are you sure you want to delete this adapter?")) return;

    if (onDelete) {
      onDelete(adapterId);
    } else {
      try {
        const response = await fetch(`/api/adapters/${adapterId}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Delete failed");
        fetchAdapters();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg p-4 text-[var(--signal-conflict-ink)]">
        <p className="font-medium">Error loading adapters</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchAdapters}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && <StatsSummary stats={stats} />}

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AdapterStatus | "")}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="ready">Ready</option>
          <option value="training">Training</option>
          <option value="untrained">Untrained</option>
          <option value="stale">Stale</option>
        </select>

        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Domains</option>
          <option value="legal">Legal</option>
          <option value="medical">Medical</option>
          <option value="technical">Technical</option>
          <option value="financial">Financial</option>
          <option value="scientific">Scientific</option>
          <option value="ecommerce">E-commerce</option>
          <option value="support">Support</option>
        </select>
      </div>

      {/* Adapter List */}
      {adapters.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {adapters.map((adapter) => (
            <AdapterCard
              key={adapter.id}
              adapter={adapter}
              onSelect={onSelect}
              onTrain={handleTrain}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatsSummary({ stats }: { stats: AdapterStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatCard label="Total" value={stats.total} colorClass="bg-gray-100" />
      <StatCard label="Ready" value={stats.ready} colorClass="bg-[var(--signal-canon-soft)]" />
      <StatCard label="Training" value={stats.training} colorClass="bg-blue-100" />
      <StatCard label="Untrained" value={stats.untrained} colorClass="bg-gray-100" />
      <StatCard label="Signals" value={stats.totalSignals} colorClass="bg-[var(--ink-100)]" />
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className={`${colorClass} rounded-lg p-4`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function AdapterCard({
  adapter,
  onSelect,
  onTrain,
  onDelete,
}: {
  adapter: Adapter;
  onSelect?: (adapter: Adapter) => void;
  onTrain: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusColors: Record<AdapterStatus, string> = {
    ready: "szn-badge szn-badge-success",
    training: "szn-badge szn-badge-info",
    untrained: "szn-badge szn-badge-muted",
    stale: "szn-badge szn-badge-warning",
  };

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect?.(adapter)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{adapter.name}</h3>
          {adapter.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {adapter.description}
            </p>
          )}
        </div>
        <span
          className={statusColors[adapter.status]}
        >
          {adapter.status}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-4">
        {adapter.domain_type && (
          <div className="flex items-center gap-2">
            <DomainIcon className="w-4 h-4" />
            <span className="capitalize">{adapter.domain_type}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <SignalIcon className="w-4 h-4" />
          <span>{adapter.training_samples} signals</span>
        </div>
        {adapter.validation_mrr && (
          <div className="flex items-center gap-2">
            <MetricIcon className="w-4 h-4" />
            <span>MRR: {(adapter.validation_mrr * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrain(adapter.id);
          }}
          disabled={adapter.status === "training"}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adapter.status === "training" ? "Training..." : "Train"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(adapter.id);
          }}
          className="px-3 py-2 text-sm font-medium text-[var(--signal-conflict-ink)] border border-[var(--signal-conflict)] rounded-lg hover:bg-[var(--signal-conflict-soft)]"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
      <EmptyIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No Adapters Yet</h3>
      <p className="text-gray-500 mb-4">
        Create your first domain adapter to start fine-tuning retrieval.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-4 animate-pulse">
            <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-full bg-gray-200 rounded mb-2" />
            <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function DomainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function SignalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function MetricIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}

export default AdapterList;
