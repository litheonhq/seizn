"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { TraceDiff } from "@/components/dashboard/TraceDiff";
import { TraceReplay } from "@/components/dashboard/TraceReplay";

interface Trace {
  id: string;
  query: string;
  created_at: string;
  config: {
    search_type?: string;
    hybrid_alpha?: number;
    rerank?: boolean;
    rerank_model?: string;
    top_k?: number;
  };
}

export function TraceDiffClient() {
  const searchParams = useSearchParams();
  const initialTraceA = searchParams.get("a") || "";
  const initialTraceB = searchParams.get("b") || "";
  const [traceA, setTraceA] = useState<string>(initialTraceA);
  const [traceB, setTraceB] = useState<string>(initialTraceB);
  const [recentTraces, setRecentTraces] = useState<Trace[]>([]);
  const [showDiff, setShowDiff] = useState(Boolean(initialTraceA && initialTraceB));
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  // Load recent traces for selection
  useEffect(() => {
    const loadRecentTraces = async () => {
      try {
        const response = await fetch("/api/traces?limit=20");
        const data = await response.json();
        if (data.success) {
          setRecentTraces(data.traces || []);
        }
      } catch (error) {
        console.error("Failed to load traces:", error);
      }
    };
    loadRecentTraces();
  }, []);

  const handleCompare = () => {
    if (traceA && traceB) {
      setShowDiff(true);
      // Update URL
      window.history.pushState({}, "", `?a=${traceA}&b=${traceB}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trace Selection */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Select Traces to Compare</h2>

        <div className="grid grid-cols-2 gap-6">
          {/* Trace A */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trace A (Baseline)
            </label>
            <select
              value={traceA}
              onChange={(e) => {
                setTraceA(e.target.value);
                setShowDiff(false);
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a trace...</option>
              {recentTraces.map((trace) => (
                <option key={trace.id} value={trace.id}>
                  {trace.query?.slice(0, 40)}... ({new Date(trace.created_at).toLocaleString()})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Or paste trace ID:</p>
            <input
              type="text"
              value={traceA}
              onChange={(e) => {
                setTraceA(e.target.value);
                setShowDiff(false);
              }}
              placeholder="Trace ID..."
              className="w-full px-3 py-2 border rounded-lg mt-1 text-sm font-mono"
            />
          </div>

          {/* Trace B */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trace B (Comparison)
            </label>
            <select
              value={traceB}
              onChange={(e) => {
                setTraceB(e.target.value);
                setShowDiff(false);
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a trace...</option>
              {recentTraces.map((trace) => (
                <option key={trace.id} value={trace.id}>
                  {trace.query?.slice(0, 40)}... ({new Date(trace.created_at).toLocaleString()})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Or paste trace ID:</p>
            <input
              type="text"
              value={traceB}
              onChange={(e) => {
                setTraceB(e.target.value);
                setShowDiff(false);
              }}
              placeholder="Trace ID..."
              className="w-full px-3 py-2 border rounded-lg mt-1 text-sm font-mono"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <button
            onClick={handleCompare}
            disabled={!traceA || !traceB || traceA === traceB}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-lg hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Compare Traces
          </button>

          {traceA && (
            <button
              onClick={() => {
                const trace = recentTraces.find((t) => t.id === traceA);
                if (trace) setSelectedTrace(trace);
              }}
              className="px-6 py-2 bg-orange-100 text-orange-700 font-medium rounded-lg hover:bg-orange-200"
            >
              Replay Trace A
            </button>
          )}
        </div>
      </div>

      {/* Diff View */}
      {showDiff && traceA && traceB && (
        <TraceDiff
          traceIdA={traceA}
          traceIdB={traceB}
          onClose={() => setShowDiff(false)}
        />
      )}

      {/* Replay Panel */}
      {selectedTrace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <TraceReplay
              traceId={selectedTrace.id}
              originalConfig={selectedTrace.config}
              onReplayComplete={(newTraceId) => {
                setTraceB(newTraceId);
                setSelectedTrace(null);
                setShowDiff(true);
              }}
            />
            <button
              onClick={() => setSelectedTrace(null)}
              className="mt-4 w-full py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">How to use Trace Diff</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Select two traces to compare their results, latency, and cost</li>
          <li>• Use &quot;Replay&quot; to re-run a trace with modified config</li>
          <li>• Compare original vs replayed to see the impact of config changes</li>
          <li>• Ranking changes show how results moved between runs</li>
        </ul>
      </div>
    </div>
  );
}
