"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TraceSnapshot {
  request_id: string;
  plan: string;
  query_hash: string;
  autopilot_reason: string;
  effective_config: {
    top_k?: number;
    threshold?: number;
    rerank?: boolean;
    rerank_model?: string;
    hybrid_weight?: number;
    answer_contract?: boolean;
  };
  timings_ms: {
    embedding?: number;
    search?: number;
    rerank?: number;
    answer?: number;
    total?: number;
  };
  results_count: number;
  created_at: string;
}

interface SharedTrace {
  success: boolean;
  share_id: string;
  trace: TraceSnapshot;
  shared_at: string;
  expires_at: string;
  view_count: number;
}

interface Props {
  shareId: string;
}

export function TraceViewerClient({ shareId }: Props) {
  const [data, setData] = useState<SharedTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/traces/${shareId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json);
        } else {
          setError(json.error?.message || 'Failed to load trace');
        }
      })
      .catch(() => setError('Failed to load trace'))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading trace...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Trace Not Found</h1>
            <p className="text-zinc-400 mb-6">{error}</p>
            <Link
              href="/"
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { trace } = data;
  const config = trace.effective_config || {};
  const timings = trace.timings_ms || {};

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">
              Viewed {data.view_count} times
            </span>
            <Link
              href="/signup"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-emerald-600/20 text-emerald-400 text-sm font-medium rounded-full">
              Shared Trace
            </span>
            <span className="text-zinc-500 text-sm font-mono">{shareId}</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Retrieval Trace
          </h1>
          <p className="text-zinc-400">
            Created {new Date(trace.created_at).toLocaleString()}
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Results"
            value={trace.results_count.toString()}
            color="emerald"
          />
          <StatCard
            label="Total Time"
            value={`${timings.total || 0}ms`}
            color="blue"
          />
          <StatCard
            label="Plan"
            value={trace.plan}
            color="purple"
          />
          <StatCard
            label="Autopilot"
            value={trace.autopilot_reason ? 'Yes' : 'No'}
            color="orange"
          />
        </div>

        {/* Configuration */}
        <Section title="Effective Configuration">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ConfigItem label="Top K" value={config.top_k} />
            <ConfigItem label="Threshold" value={config.threshold} />
            <ConfigItem label="Hybrid Weight" value={config.hybrid_weight} />
            <ConfigItem label="Rerank" value={config.rerank ? 'Enabled' : 'Disabled'} />
            <ConfigItem label="Rerank Model" value={config.rerank_model || '-'} />
            <ConfigItem label="Answer Contract" value={config.answer_contract ? 'Enabled' : 'Disabled'} />
          </div>
        </Section>

        {/* Timing Breakdown */}
        <Section title="Timing Breakdown">
          <div className="space-y-3">
            {timings.embedding && (
              <TimingBar label="Embedding" ms={timings.embedding} total={timings.total || 1} />
            )}
            {timings.search && (
              <TimingBar label="Search" ms={timings.search} total={timings.total || 1} />
            )}
            {timings.rerank && (
              <TimingBar label="Rerank" ms={timings.rerank} total={timings.total || 1} />
            )}
            {timings.answer && (
              <TimingBar label="Answer" ms={timings.answer} total={timings.total || 1} />
            )}
          </div>
        </Section>

        {/* Autopilot Reason */}
        {trace.autopilot_reason && (
          <Section title="Autopilot Decision">
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <p className="text-zinc-300 font-mono text-sm">
                {trace.autopilot_reason}
              </p>
            </div>
          </Section>
        )}

        {/* CTA */}
        <div className="mt-12 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Want tracing for your AI?
          </h2>
          <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
            Seizn provides full observability for your RAG pipelines. Debug search quality, optimize costs, and ship with confidence.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/docs"
              className="px-6 py-3 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700"
            >
              Read Docs
            </Link>
            <Link
              href="/signup"
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500"
            >
              Start Free
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-zinc-500 text-sm">
          Expires {new Date(data.expires_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-600/20 text-emerald-400',
    blue: 'bg-blue-600/20 text-blue-400',
    purple: 'bg-purple-600/20 text-purple-400',
    orange: 'bg-orange-600/20 text-orange-400',
  };

  return (
    <div className={`rounded-xl p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        {children}
      </div>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-white font-mono">
        {value !== undefined && value !== null ? String(value) : '-'}
      </div>
    </div>
  );
}

function TimingBar({ label, ms, total }: { label: string; ms: number; total: number }) {
  const percentage = Math.min(100, (ms / total) * 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-mono">{ms}ms</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
