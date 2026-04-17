"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { TraceDiff } from "@/components/dashboard/TraceDiff";
import { TraceReplay } from "@/components/dashboard/TraceReplay";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

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
  const { t } = useDashboardTranslation();
  const searchParams = useSearchParams();
  const initialTraceA = searchParams.get("a") || "";
  const initialTraceB = searchParams.get("b") || "";
  const [traceA, setTraceA] = useState<string>(initialTraceA);
  const [traceB, setTraceB] = useState<string>(initialTraceB);
  const [recentTraces, setRecentTraces] = useState<Trace[]>([]);
  const [showDiff, setShowDiff] = useState(Boolean(initialTraceA && initialTraceB));
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

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
      window.history.pushState({}, "", `?a=${traceA}&b=${traceB}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-szn-text-1">
          {t("dashboard.traceComparePage.title") || "Compare Traces"}
        </h1>
        <p className="text-szn-text-2 mt-1">
          {t("dashboard.traceComparePage.subtitle") || "Analyze differences between two trace executions"}
        </p>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">
          {t("dashboard.traceComparePage.selectTitle") || "Select traces to compare"}
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("dashboard.traceComparePage.traceABaseline") || "Trace A (baseline)"}
            </label>
            <select
              value={traceA}
              onChange={(e) => {
                setTraceA(e.target.value);
                setShowDiff(false);
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("dashboard.traceComparePage.selectTrace") || "Select a trace..."}</option>
              {recentTraces.map((trace) => (
                <option key={trace.id} value={trace.id}>
                  {trace.query?.slice(0, 40)}... ({new Date(trace.created_at).toLocaleString()})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t("dashboard.traceComparePage.pasteTraceId") || "Or paste a trace ID:"}
            </p>
            <input
              type="text"
              value={traceA}
              onChange={(e) => {
                setTraceA(e.target.value);
                setShowDiff(false);
              }}
              placeholder={t("dashboard.traceComparePage.traceIdPlaceholder") || "Trace ID..."}
              className="w-full px-3 py-2 border rounded-lg mt-1 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("dashboard.traceComparePage.traceBComparison") || "Trace B (comparison)"}
            </label>
            <select
              value={traceB}
              onChange={(e) => {
                setTraceB(e.target.value);
                setShowDiff(false);
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="">{t("dashboard.traceComparePage.selectTrace") || "Select a trace..."}</option>
              {recentTraces.map((trace) => (
                <option key={trace.id} value={trace.id}>
                  {trace.query?.slice(0, 40)}... ({new Date(trace.created_at).toLocaleString()})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t("dashboard.traceComparePage.pasteTraceId") || "Or paste a trace ID:"}
            </p>
            <input
              type="text"
              value={traceB}
              onChange={(e) => {
                setTraceB(e.target.value);
                setShowDiff(false);
              }}
              placeholder={t("dashboard.traceComparePage.traceIdPlaceholder") || "Trace ID..."}
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
            {t("dashboard.traceComparePage.compareButton") || "Compare traces"}
          </button>

          {traceA && (
            <button
              onClick={() => {
                const trace = recentTraces.find((item) => item.id === traceA);
                if (trace) {
                  setSelectedTrace(trace);
                }
              }}
              className="px-6 py-2 bg-orange-100 text-orange-700 font-medium rounded-lg hover:bg-orange-200"
            >
              {t("dashboard.traceComparePage.replayTraceA") || "Replay trace A"}
            </button>
          )}
        </div>
      </div>

      {showDiff && traceA && traceB && (
        <TraceDiff
          traceIdA={traceA}
          traceIdB={traceB}
          onClose={() => setShowDiff(false)}
        />
      )}

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
              {t("dashboard.traceComparePage.cancel") || "Cancel"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">
          {t("dashboard.traceComparePage.helpTitle") || "How to use trace diff"}
        </h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>{t("dashboard.traceComparePage.helpLine1") || "Select two traces to compare their results, latency, and cost."}</li>
          <li>{t("dashboard.traceComparePage.helpLine2") || "Use replay to run a trace again with a modified config."}</li>
          <li>{t("dashboard.traceComparePage.helpLine3") || "Compare the original and replayed runs to see the impact of config changes."}</li>
          <li>{t("dashboard.traceComparePage.helpLine4") || "Ranking changes show how results moved between runs."}</li>
        </ul>
      </div>
    </div>
  );
}
