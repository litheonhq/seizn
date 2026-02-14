"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

// ============================================
// Types
// ============================================

interface AutopilotConfig {
  id: string;
  user_id: string;
  collection_id: string | null;
  enabled: boolean;
  mode: "conservative" | "balanced" | "aggressive" | "experimental";
  max_latency_ms: number;
  max_cost_per_query: number;
  min_relevance_threshold: number;
  exploration_rate: number;
  learning_rate: number;
  min_samples_before_learning: number;
  use_thompson_sampling: boolean;
  decay_factor: number;
  total_decisions: number;
  successful_decisions: number;
  created_at: string;
  updated_at: string;
}

interface DecisionLog {
  id: string;
  trace_id: string;
  query: string;
  decision: {
    search_type: string;
    top_k: number;
    rerank_enabled: boolean;
    hybrid_alpha?: number;
  };
  reason: string;
  outcome: "success" | "failure" | "pending";
  latency_ms: number;
  cost_usd: number;
  created_at: string;
}

// ============================================
// Mock Data
// ============================================

const MOCK_CONFIG: AutopilotConfig = {
  id: "config-001",
  user_id: "user-001",
  collection_id: null,
  enabled: true,
  mode: "balanced",
  max_latency_ms: 1000,
  max_cost_per_query: 0.01,
  min_relevance_threshold: 0.7,
  exploration_rate: 0.1,
  learning_rate: 0.05,
  min_samples_before_learning: 100,
  use_thompson_sampling: true,
  decay_factor: 0.95,
  total_decisions: 1247,
  successful_decisions: 1089,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-14T10:00:00Z",
};

const MOCK_LOGS: DecisionLog[] = [
  {
    id: "log-001",
    trace_id: "trace-001",
    query: "How do I reset my password?",
    decision: { search_type: "hybrid", top_k: 10, rerank_enabled: true, hybrid_alpha: 0.7 },
    reason: "High-confidence hybrid search selected based on query complexity and historical performance",
    outcome: "success",
    latency_ms: 245,
    cost_usd: 0.0012,
    created_at: "2026-01-14T10:30:00Z",
  },
  {
    id: "log-002",
    trace_id: "trace-002",
    query: "What are the pricing plans?",
    decision: { search_type: "semantic", top_k: 5, rerank_enabled: false },
    reason: "Simple factual query, semantic search sufficient",
    outcome: "success",
    latency_ms: 156,
    cost_usd: 0.0008,
    created_at: "2026-01-14T10:25:00Z",
  },
  {
    id: "log-003",
    trace_id: "trace-003",
    query: "integration steps for nextjs authentication",
    decision: { search_type: "hybrid", top_k: 15, rerank_enabled: true, hybrid_alpha: 0.6 },
    reason: "Technical query with multiple concepts, aggressive retrieval",
    outcome: "success",
    latency_ms: 312,
    cost_usd: 0.0018,
    created_at: "2026-01-14T10:20:00Z",
  },
  {
    id: "log-004",
    trace_id: "trace-004",
    query: "API rate limits exceeded error",
    decision: { search_type: "keyword", top_k: 10, rerank_enabled: true },
    reason: "Error-related query, keyword matching important for exact matches",
    outcome: "failure",
    latency_ms: 189,
    cost_usd: 0.001,
    created_at: "2026-01-14T10:15:00Z",
  },
  {
    id: "log-005",
    trace_id: "trace-005",
    query: "best practices for memory management",
    decision: { search_type: "hybrid", top_k: 10, rerank_enabled: true, hybrid_alpha: 0.65 },
    reason: "Exploration decision - testing hybrid_alpha variation",
    outcome: "pending",
    latency_ms: 267,
    cost_usd: 0.0014,
    created_at: "2026-01-14T10:10:00Z",
  },
];

// ============================================
// Icons
// ============================================

const CpuIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CogIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ListIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

// ============================================
// Component
// ============================================

export default function AutopilotClient() {
  const { t } = useDashboardTranslation();
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [logs, setLogs] = useState<DecisionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setConfig(MOCK_CONFIG);
      setLogs(MOCK_LOGS);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleToggle = useCallback(async () => {
    if (!config) return;
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 300));
    setConfig({ ...config, enabled: !config.enabled });
    setIsSaving(false);
  }, [config]);

  const handleModeChange = useCallback(async (mode: AutopilotConfig["mode"]) => {
    if (!config) return;
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setConfig({ ...config, mode });
    setIsSaving(false);
  }, [config]);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const getOutcomeIcon = (outcome: DecisionLog["outcome"]) => {
    switch (outcome) {
      case "success":
        return <CheckIcon className="w-4 h-4 text-green-500" />;
      case "failure":
        return <XIcon className="w-4 h-4 text-red-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getModeDescription = (mode: AutopilotConfig["mode"]) => {
    switch (mode) {
      case "conservative":
        return "Prefer stable, proven configurations. Lower exploration.";
      case "balanced":
        return "Balance exploration with exploitation. Recommended.";
      case "aggressive":
        return "More exploration, faster learning. May have variance.";
      case "experimental":
        return "Maximum exploration. Best for testing new strategies.";
    }
  };

  const successRate = config
    ? Math.round((config.successful_decisions / config.total_decisions) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <CpuIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("dashboard.autopilot.title") || "Autopilot"}</h1>
              <p className="text-gray-500 dark:text-gray-400">{t("dashboard.autopilot.subtitle") || "AI-powered retrieval optimization"}</p>
            </div>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${
                config?.enabled ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {config?.enabled ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={handleToggle}
              disabled={isLoading || isSaving}
              className={`relative w-14 h-8 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 ${
                config?.enabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"
              } ${isSaving ? "opacity-50" : ""}`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                  config?.enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Stats */}
        {config && (
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{config.total_decisions.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Decisions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{successRate}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Success Rate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{config.mode}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Current Mode</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{(config.exploration_rate * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Exploration Rate</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("settings")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
            activeTab === "settings"
              ? "bg-teal-500 text-white"
              : "bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60"
          }`}
        >
          <CogIcon className="w-4 h-4" />
          {t("dashboard.autopilot.settings") || "Settings"}
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
            activeTab === "logs"
              ? "bg-teal-500 text-white"
              : "bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60"
          }`}
        >
          <ListIcon className="w-4 h-4" />
          {t("dashboard.autopilot.decisionLogs") || "Decision Logs"}
        </button>
      </div>

      {activeTab === "settings" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mode Selection */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t("dashboard.autopilot.operationMode") || "Operation Mode"}</h2>
            <div className="space-y-3">
              {(["conservative", "balanced", "aggressive", "experimental"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={isSaving}
                  className={`w-full p-4 rounded-xl text-left transition-colors ${
                    config?.mode === mode
                      ? "bg-teal-50 dark:bg-teal-950/30 border-2 border-teal-500 dark:border-teal-400"
                      : "bg-gray-50 dark:bg-gray-900/40 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize text-gray-900 dark:text-gray-100">{mode}</span>
                    {config?.mode === mode && (
                      <span className="px-2 py-1 text-xs bg-teal-500 text-white rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{getModeDescription(mode)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t("dashboard.autopilot.parameters") || "Parameters"}</h2>
            {config && (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Max Latency</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{config.max_latency_ms}ms</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Max Cost per Query</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">${config.max_cost_per_query.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Min Relevance Threshold</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{(config.min_relevance_threshold * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Learning Rate</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{config.learning_rate}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Min Samples Before Learning</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{config.min_samples_before_learning}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Thompson Sampling</span>
                  <span className={`font-medium ${config.use_thompson_sampling ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}`}>
                    {config.use_thompson_sampling ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Decay Factor</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{config.decay_factor}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Decision Logs */
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t("dashboard.autopilot.recentDecisions") || "Recent Decisions"}</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-teal-500 dark:border-teal-400 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <ListIcon className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <p>{t("dashboard.autopilot.noLogs") || "No decision logs yet"}</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{getOutcomeIcon(log.outcome)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{log.query}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{log.reason}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full">
                          {log.decision.search_type}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full">
                          top_k: {log.decision.top_k}
                        </span>
                        {log.decision.rerank_enabled && (
                          <span className="px-2 py-1 bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-200 rounded-full">rerank</span>
                        )}
                        <span className="text-gray-400 dark:text-gray-600">|</span>
                        <span className="text-gray-500 dark:text-gray-400">{log.latency_ms}ms</span>
                        <span className="text-gray-500 dark:text-gray-400">${(log.cost_usd * 1000).toFixed(2)}m</span>
                        <span className="text-gray-400 dark:text-gray-500 ml-auto">{formatDate(log.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
