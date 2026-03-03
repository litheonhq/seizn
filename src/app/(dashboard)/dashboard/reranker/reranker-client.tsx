"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format-date";

type TabType = "overview" | "data" | "train" | "evaluate";

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
}

interface DomainConfig {
  type: string;
  name: string;
  description: string;
  recommendedModel: string;
  defaultThreshold: number;
  specializations: string[];
}

interface DetectedDomain {
  label: string;
  confidence: number;
  isOverridden: boolean;
}

interface DataCollectionStats {
  clicks: number;
  adoptions: number;
  corrections: number;
  totalQueries: number;
  lastUpdated: string;
}

interface TrainingJob {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  modelVersion?: string;
  error?: string;
}

interface EvalResult {
  id: string;
  name: string;
  dataset: string;
  metrics: {
    precision_at_1: number;
    precision_at_5: number;
    precision_at_10: number;
    mrr: number;
    ndcg: number;
  };
  baseline?: {
    precision_at_1: number;
    precision_at_5: number;
    precision_at_10: number;
    mrr: number;
    ndcg: number;
  };
  runAt: string;
}

export function RerankerClient() {
  const [models, setModels] = useState<Model[]>([]);
  const [domains, setDomains] = useState<Record<string, DomainConfig>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Configuration
  const [selectedModel, setSelectedModel] = useState("cohere-rerank-v3");
  const [selectedDomain, setSelectedDomain] = useState("general");
  const [threshold, setThreshold] = useState(0.3);
  const [autoDetect, setAutoDetect] = useState(true);

  // Auto-detected domain result
  const [detectedDomain, setDetectedDomain] = useState<DetectedDomain>({
    label: "Technical Documentation",
    confidence: 0.87,
    isOverridden: false,
  });

  // Data collection stats (simulated)
  const [dataStats, setDataStats] = useState<DataCollectionStats>({
    clicks: 1234,
    adoptions: 892,
    corrections: 45,
    totalQueries: 5678,
    lastUpdated: new Date().toISOString(),
  });

  // Training job state
  const [trainingJob, setTrainingJob] = useState<TrainingJob>({
    id: "job-001",
    status: "idle",
    modelVersion: "v1.2.3",
  });

  // Evaluation results (sample data)
  const [evalResults, setEvalResults] = useState<EvalResult[]>([
    {
      id: "eval-1",
      name: "Production Baseline",
      dataset: "tech-docs-golden",
      metrics: {
        precision_at_1: 0.82,
        precision_at_5: 0.91,
        precision_at_10: 0.95,
        mrr: 0.87,
        ndcg: 0.89,
      },
      baseline: {
        precision_at_1: 0.75,
        precision_at_5: 0.85,
        precision_at_10: 0.90,
        mrr: 0.80,
        ndcg: 0.82,
      },
      runAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  // Test panel
  const [testQuery, setTestQuery] = useState("");
  const [testDocuments, setTestDocuments] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Suppress unused variable warnings
  void setDataStats;
  void setEvalResults;

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/rerank");
      const data = await response.json();
      if (data.success) {
        setModels(data.models || []);
        setDomains(data.domains || {});
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    // Update threshold when domain changes
    if (domains[selectedDomain]) {
      setThreshold(domains[selectedDomain].defaultThreshold);
    }
  }, [selectedDomain, domains]);

  const handleTest = async () => {
    if (!testQuery.trim() || !testDocuments.trim()) return;

    setTestLoading(true);
    try {
      // Parse documents (one per line)
      const docs = testDocuments
        .split("\n")
        .filter((line) => line.trim())
        .map((content, idx) => ({
          id: `doc-${idx + 1}`,
          content: content.trim(),
        }));

      const response = await fetch("/api/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: testQuery,
          documents: docs,
          config: {
            model: selectedModel,
            domain: autoDetect ? undefined : selectedDomain,
            threshold,
          },
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      console.error("Test failed:", error);
      setTestResult({ error: "Test failed" });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-szn-surface rounded w-48" />
          <div className="h-64 bg-szn-surface rounded" />
        </div>
      </div>
    );
  }

  // Start training job
  const handleStartTraining = async () => {
    setTrainingJob((prev) => ({
      ...prev,
      status: "running",
      progress: 0,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      error: undefined,
    }));

    // Simulate training progress
    const interval = setInterval(() => {
      setTrainingJob((prev) => {
        if (prev.progress !== undefined && prev.progress >= 100) {
          clearInterval(interval);
          return {
            ...prev,
            status: "completed",
            progress: 100,
            completedAt: new Date().toISOString(),
            modelVersion: `v1.${Math.floor(Math.random() * 10)}.0`,
          };
        }
        return {
          ...prev,
          progress: (prev.progress || 0) + Math.random() * 15,
        };
      });
    }, 500);
  };

  // Run evaluation
  const handleRunEvaluation = async () => {
    const newEval: EvalResult = {
      id: `eval-${Date.now()}`,
      name: `Eval Run ${evalResults.length + 1}`,
      dataset: "tech-docs-golden",
      metrics: {
        precision_at_1: 0.8 + Math.random() * 0.15,
        precision_at_5: 0.88 + Math.random() * 0.1,
        precision_at_10: 0.93 + Math.random() * 0.05,
        mrr: 0.85 + Math.random() * 0.1,
        ndcg: 0.87 + Math.random() * 0.1,
      },
      baseline: evalResults[0]?.metrics,
      runAt: new Date().toISOString(),
    };
    setEvalResults((prev) => [newEval, ...prev]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-szn-text-1">Domain-adaptive Reranker</h1>
        <p className="text-szn-text-2 mt-1">
          Configure reranking models optimized for your content domain
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 border-b">
        {(["overview", "data", "train", "evaluate"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-szn-accent text-szn-accent"
                : "border-transparent text-szn-text-2 hover:text-szn-text-1"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Auto-detected Domain Banner */}
      {autoDetect && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-blue-700">
                  <span className="font-medium">Auto-detected Domain:</span>{" "}
                  <span className="font-semibold text-blue-900">{detectedDomain.label}</span>
                </p>
                <p className="text-xs text-blue-600">
                  Confidence: {(detectedDomain.confidence * 100).toFixed(0)}%
                  {detectedDomain.isOverridden && " (overridden)"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setAutoDetect(false);
                setDetectedDomain((prev) => ({ ...prev, isOverridden: true }));
              }}
              className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
            >
              Override
            </button>
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 gap-8">
        {/* Configuration Panel */}
        <div className="space-y-6">
          {/* Model Selection */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <h2 className="font-semibold text-szn-text-1 mb-4">Reranker Model</h2>
            <div className="space-y-3">
              {models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModel === model.id
                      ? "border-szn-accent bg-szn-accent/10"
                      : "border-szn-border hover:border-szn-border/80"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-szn-text-1">{model.name}</p>
                    <p className="text-sm text-szn-text-2">
                      {model.provider} - {model.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Domain Selection */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-szn-text-1">Content Domain</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) => setAutoDetect(e.target.checked)}
                  className="rounded"
                />
                Auto-detect
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {Object.values(domains).map((domain) => (
                <button
                  key={domain.type}
                  onClick={() => setSelectedDomain(domain.type)}
                  disabled={autoDetect}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedDomain === domain.type && !autoDetect
                      ? "border-szn-accent bg-szn-accent/10"
                      : autoDetect
                      ? "opacity-50 cursor-not-allowed"
                      : "border-szn-border hover:border-szn-border/80"
                  }`}
                >
                  <p className="font-medium text-szn-text-1">{domain.name}</p>
                  <p className="text-xs text-szn-text-2 mt-1">{domain.description}</p>
                </button>
              ))}
            </div>

            {!autoDetect && domains[selectedDomain] && (
              <div className="mt-4 p-3 bg-szn-surface rounded-lg">
                <p className="text-sm text-szn-text-2">
                  <span className="font-medium">Specializations:</span>{" "}
                  {domains[selectedDomain].specializations.join(", ")}
                </p>
                <p className="text-sm text-szn-text-2 mt-1">
                  <span className="font-medium">Recommended model:</span>{" "}
                  {domains[selectedDomain].recommendedModel}
                </p>
              </div>
            )}
          </div>

          {/* Threshold */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <h2 className="font-semibold text-szn-text-1 mb-4">Relevance Threshold</h2>
            <div className="space-y-4">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-szn-text-2">
                <span>0 (Include all)</span>
                <span className="font-medium text-szn-text-1">{threshold.toFixed(2)}</span>
                <span>1 (Strict)</span>
              </div>
              <p className="text-sm text-szn-text-2">
                Documents with rerank score below this threshold will be filtered out
              </p>
            </div>
          </div>
        </div>

        {/* Test Panel */}
        <div className="space-y-6">
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <h2 className="font-semibold text-szn-text-1 mb-4">Test Reranker</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1">
                  Query
                </label>
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Enter your search query..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1">
                  Documents (one per line)
                </label>
                <textarea
                  value={testDocuments}
                  onChange={(e) => setTestDocuments(e.target.value)}
                  placeholder={`Document 1 content here...
Document 2 content here...
Document 3 content here...`}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                />
              </div>

              <button
                onClick={handleTest}
                disabled={testLoading || !testQuery.trim() || !testDocuments.trim()}
                className="w-full px-4 py-2 bg-szn-accent text-white rounded-lg hover:bg-szn-accent/90 disabled:opacity-50"
              >
                {testLoading ? "Reranking..." : "Test Rerank"}
              </button>
            </div>

            {testResult !== null && (
              <div className="mt-4">
                <h3 className="font-medium text-szn-text-1 mb-2">Results</h3>
                {(testResult as { success?: boolean; documents?: Array<{ rank: number; content: string; rerankScore: number }> }).success ? (
                  <div className="space-y-2">
                    <div className="flex gap-4 text-sm text-szn-text-2 mb-3">
                      <span>
                        Model: <span className="text-szn-text-1">{(testResult as { model: string }).model}</span>
                      </span>
                      <span>
                        Domain: <span className="text-szn-text-1">{(testResult as { domain: string }).domain}</span>
                      </span>
                      <span>
                        Latency: <span className="text-szn-text-1">{(testResult as { latency_ms: number }).latency_ms}ms</span>
                      </span>
                    </div>
                    {((testResult as { documents: Array<{ rank: number; content: string; rerankScore: number }> }).documents || []).map((doc: { rank: number; content: string; rerankScore: number }, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-szn-surface rounded-lg flex items-start gap-3"
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            doc.rank === 1
                              ? "bg-szn-accent text-white"
                              : "bg-gray-200 text-szn-text-2"
                          }`}
                        >
                          {doc.rank}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-szn-text-1 line-clamp-2">
                            {doc.content}
                          </p>
                          <p className="text-xs text-szn-text-2 mt-1">
                            Score: {doc.rerankScore.toFixed(4)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(testResult as { documents?: unknown[] }).documents?.length === 0 && (
                      <p className="text-sm text-szn-text-2">
                        No documents passed the threshold filter
                      </p>
                    )}
                  </div>
                ) : (
                  <pre className="p-3 bg-red-50 rounded-lg text-sm text-red-600 overflow-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Usage Tips */}
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
            <h3 className="font-semibold text-blue-900 mb-3">Tips for Better Reranking</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Use domain-specific models for specialized content</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Enable auto-detect for mixed content types</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Lower threshold for recall, higher for precision</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Train custom models for your specific use case</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      )}

      {/* Data Tab - Data Collection Stats */}
      {activeTab === "data" && (
        <div className="space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-szn-text-2">Total Clicks</p>
                  <p className="text-2xl font-bold text-szn-text-1">{dataStats.clicks.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-szn-text-3">User click signals</p>
            </div>

            <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-szn-text-2">Adoptions</p>
                  <p className="text-2xl font-bold text-szn-text-1">{dataStats.adoptions.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-szn-text-3">Result used in context</p>
            </div>

            <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-szn-text-2">Corrections</p>
                  <p className="text-2xl font-bold text-szn-text-1">{dataStats.corrections}</p>
                </div>
              </div>
              <p className="text-xs text-szn-text-3">User re-ordered results</p>
            </div>

            <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-szn-text-2">Total Queries</p>
                  <p className="text-2xl font-bold text-szn-text-1">{dataStats.totalQueries.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-szn-text-3">Rerank API calls</p>
            </div>
          </div>

          {/* Data Quality Indicators */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <h3 className="font-semibold text-szn-text-1 mb-4">Data Quality</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-szn-text-2">Click-through Rate</span>
                  <span className="text-sm font-medium text-szn-text-1">
                    {((dataStats.clicks / dataStats.totalQueries) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${(dataStats.clicks / dataStats.totalQueries) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-szn-text-2">Adoption Rate</span>
                  <span className="text-sm font-medium text-szn-text-1">
                    {((dataStats.adoptions / dataStats.clicks) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-szn-accent rounded-full"
                    style={{ width: `${(dataStats.adoptions / dataStats.clicks) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-szn-text-2">Correction Rate</span>
                  <span className="text-sm font-medium text-szn-text-1">
                    {((dataStats.corrections / dataStats.clicks) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${(dataStats.corrections / dataStats.clicks) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-szn-text-3">
              Last updated: {new Date(dataStats.lastUpdated).toLocaleString()}
            </p>
          </div>

          {/* Recommendation */}
          <div className="bg-gradient-to-r from-szn-accent/5 to-szn-accent/10 rounded-2xl border border-szn-accent/20 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h4 className="font-medium text-szn-accent mb-1">Ready for Training</h4>
                <p className="text-sm text-szn-success">
                  You have collected enough feedback data ({dataStats.clicks.toLocaleString()} clicks) to train a custom reranker model.
                  Training typically takes 10-15 minutes.
                </p>
                <button
                  onClick={() => setActiveTab("train")}
                  className="mt-3 px-4 py-2 bg-szn-accent text-white text-sm font-medium rounded-lg hover:bg-szn-accent/90 transition-colors"
                >
                  Start Training
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Train Tab */}
      {activeTab === "train" && (
        <div className="space-y-6">
          {/* Current Model Info */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-szn-text-1">Current Model</h3>
              <span className="px-3 py-1 bg-szn-success/10 text-szn-success text-sm font-medium rounded-full">
                {trainingJob.modelVersion || "v1.0.0"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-szn-text-2">Base Model</p>
                <p className="font-medium text-szn-text-1">{selectedModel}</p>
              </div>
              <div>
                <p className="text-szn-text-2">Domain</p>
                <p className="font-medium text-szn-text-1">{domains[selectedDomain]?.name || selectedDomain}</p>
              </div>
              <div>
                <p className="text-szn-text-2">Training Data</p>
                <p className="font-medium text-szn-text-1">{dataStats.clicks.toLocaleString()} samples</p>
              </div>
            </div>
          </div>

          {/* Training Controls */}
          <div className="bg-szn-card rounded-2xl border border-szn-border p-6">
            <h3 className="font-semibold text-szn-text-1 mb-4">Training Job</h3>

            {trainingJob.status === "idle" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-szn-surface rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-szn-text-2 mb-4">No training job running</p>
                <button
                  onClick={handleStartTraining}
                  className="px-6 py-3 bg-szn-accent text-white font-medium rounded-xl hover:bg-szn-accent/90 transition-colors"
                >
                  Start Training
                </button>
              </div>
            )}

            {trainingJob.status === "running" && (
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-szn-text-1">Training in progress</p>
                      <p className="text-sm text-szn-text-2">
                        Started {trainingJob.startedAt ? new Date(trainingJob.startedAt).toLocaleTimeString() : "now"}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">
                    {Math.min(100, Math.round(trainingJob.progress || 0))}%
                  </span>
                </div>
                <div className="h-3 bg-szn-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, trainingJob.progress || 0)}%` }}
                  />
                </div>
              </div>
            )}

            {trainingJob.status === "completed" && (
              <div className="py-4">
                <div className="flex items-center gap-3 p-4 bg-szn-accent/5 rounded-xl mb-4">
                  <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-szn-accent">Training completed!</p>
                    <p className="text-sm text-szn-success">
                      New model version: {trainingJob.modelVersion}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setActiveTab("evaluate")}
                    className="flex-1 px-4 py-2 bg-szn-accent text-white font-medium rounded-lg hover:bg-szn-accent/90 transition-colors"
                  >
                    Run Evaluation
                  </button>
                  <button
                    onClick={() => setTrainingJob({ id: "job-new", status: "idle", modelVersion: trainingJob.modelVersion })}
                    className="px-4 py-2 border border-szn-border text-szn-text-1 font-medium rounded-lg hover:bg-szn-surface-1 transition-colors"
                  >
                    Train Again
                  </button>
                </div>
              </div>
            )}

            {trainingJob.status === "failed" && (
              <div className="py-4">
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl mb-4">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-red-900">Training failed</p>
                    <p className="text-sm text-red-700">{trainingJob.error || "Unknown error"}</p>
                  </div>
                </div>
                <button
                  onClick={handleStartTraining}
                  className="w-full px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
                >
                  Retry Training
                </button>
              </div>
            )}
          </div>

          {/* Training Tips */}
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6">
            <h4 className="font-medium text-amber-900 mb-3">Training Tips</h4>
            <ul className="space-y-2 text-sm text-amber-800">
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>More click data leads to better model performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Correction signals are especially valuable for training</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Training runs automatically update the production model</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Evaluate Tab */}
      {activeTab === "evaluate" && (
        <div className="space-y-6">
          {/* Run New Evaluation */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-szn-text-1">Evaluation Results</h3>
            <button
              onClick={handleRunEvaluation}
              className="px-4 py-2 bg-szn-accent text-white text-sm font-medium rounded-lg hover:bg-szn-accent/90 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Evaluation
            </button>
          </div>

          {/* Results Table */}
          <div className="bg-szn-card rounded-2xl border border-szn-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-szn-bg">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    Run
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    P@1
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    P@5
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    P@10
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    MRR
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    nDCG
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                {evalResults.map((result, idx) => (
                  <tr key={result.id} className={idx === 0 ? "bg-szn-accent/5" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-szn-text-1">{result.name}</p>
                        <p className="text-xs text-szn-text-2">{result.dataset}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MetricCell
                        value={result.metrics.precision_at_1}
                        baseline={result.baseline?.precision_at_1}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MetricCell
                        value={result.metrics.precision_at_5}
                        baseline={result.baseline?.precision_at_5}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MetricCell
                        value={result.metrics.precision_at_10}
                        baseline={result.baseline?.precision_at_10}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MetricCell
                        value={result.metrics.mrr}
                        baseline={result.baseline?.mrr}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MetricCell
                        value={result.metrics.ndcg}
                        baseline={result.baseline?.ndcg}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-szn-text-2">
                      {formatDate(result.runAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Metrics Explanation */}
          <div className="bg-szn-surface rounded-2xl border p-6">
            <h4 className="font-medium text-szn-text-1 mb-3">Metrics Explained</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-szn-text-1">Precision@K (P@K)</p>
                <p className="text-szn-text-2">Percentage of relevant documents in top K results</p>
              </div>
              <div>
                <p className="font-medium text-szn-text-1">MRR (Mean Reciprocal Rank)</p>
                <p className="text-szn-text-2">Average of reciprocal ranks of first relevant result</p>
              </div>
              <div>
                <p className="font-medium text-szn-text-1">nDCG (Normalized DCG)</p>
                <p className="text-szn-text-2">Measures ranking quality with graded relevance</p>
              </div>
              <div>
                <p className="font-medium text-szn-text-1">Baseline Comparison</p>
                <p className="text-szn-text-2">Green = improvement, Red = regression vs baseline</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for metric cells with delta indicators
function MetricCell({ value, baseline }: { value: number; baseline?: number }) {
  const delta = baseline ? value - baseline : 0;
  const isImproved = delta > 0;
  const isRegressed = delta < 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-szn-text-1">{(value * 100).toFixed(1)}%</span>
      {baseline !== undefined && delta !== 0 && (
        <span
          className={`text-xs font-medium ${
            isImproved ? "text-szn-accent" : isRegressed ? "text-red-600" : "text-szn-text-3"
          }`}
        >
          {isImproved ? "+" : ""}{(delta * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}
