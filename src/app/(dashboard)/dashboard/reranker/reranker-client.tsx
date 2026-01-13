"use client";

import { useState, useEffect } from "react";

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

export function RerankerClient() {
  const [models, setModels] = useState<Model[]>([]);
  const [domains, setDomains] = useState<Record<string, DomainConfig>>({});
  const [loading, setLoading] = useState(true);

  // Configuration
  const [selectedModel, setSelectedModel] = useState("cohere-rerank-v3");
  const [selectedDomain, setSelectedDomain] = useState("general");
  const [threshold, setThreshold] = useState(0.3);
  const [autoDetect, setAutoDetect] = useState(true);

  // Test panel
  const [testQuery, setTestQuery] = useState("");
  const [testDocuments, setTestDocuments] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    // Update threshold when domain changes
    if (domains[selectedDomain]) {
      setThreshold(domains[selectedDomain].defaultThreshold);
    }
  }, [selectedDomain, domains]);

  const loadConfig = async () => {
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
  };

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
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Domain-adaptive Reranker</h1>
        <p className="text-gray-500 mt-1">
          Configure reranking models optimized for your content domain
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Configuration Panel */}
        <div className="space-y-6">
          {/* Model Selection */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Reranker Model</h2>
            <div className="space-y-3">
              {models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModel === model.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 hover:border-gray-300"
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
                    <p className="font-medium text-gray-900">{model.name}</p>
                    <p className="text-sm text-gray-500">
                      {model.provider} - {model.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Domain Selection */}
          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Content Domain</h2>
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
                      ? "border-emerald-500 bg-emerald-50"
                      : autoDetect
                      ? "opacity-50 cursor-not-allowed"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-gray-900">{domain.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{domain.description}</p>
                </button>
              ))}
            </div>

            {!autoDetect && domains[selectedDomain] && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Specializations:</span>{" "}
                  {domains[selectedDomain].specializations.join(", ")}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Recommended model:</span>{" "}
                  {domains[selectedDomain].recommendedModel}
                </p>
              </div>
            )}
          </div>

          {/* Threshold */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Relevance Threshold</h2>
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
              <div className="flex justify-between text-sm text-gray-500">
                <span>0 (Include all)</span>
                <span className="font-medium text-gray-900">{threshold.toFixed(2)}</span>
                <span>1 (Strict)</span>
              </div>
              <p className="text-sm text-gray-500">
                Documents with rerank score below this threshold will be filtered out
              </p>
            </div>
          </div>
        </div>

        {/* Test Panel */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Test Reranker</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
              >
                {testLoading ? "Reranking..." : "Test Rerank"}
              </button>
            </div>

            {testResult && (
              <div className="mt-4">
                <h3 className="font-medium text-gray-900 mb-2">Results</h3>
                {(testResult as { success?: boolean; documents?: Array<{ rank: number; content: string; rerankScore: number }> }).success ? (
                  <div className="space-y-2">
                    <div className="flex gap-4 text-sm text-gray-500 mb-3">
                      <span>
                        Model: <span className="text-gray-900">{(testResult as { model: string }).model}</span>
                      </span>
                      <span>
                        Domain: <span className="text-gray-900">{(testResult as { domain: string }).domain}</span>
                      </span>
                      <span>
                        Latency: <span className="text-gray-900">{(testResult as { latency_ms: number }).latency_ms}ms</span>
                      </span>
                    </div>
                    {((testResult as { documents: Array<{ rank: number; content: string; rerankScore: number }> }).documents || []).map((doc: { rank: number; content: string; rerankScore: number }, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-gray-50 rounded-lg flex items-start gap-3"
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            doc.rank === 1
                              ? "bg-emerald-500 text-white"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {doc.rank}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-gray-900 line-clamp-2">
                            {doc.content}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Score: {doc.rerankScore.toFixed(4)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(testResult as { documents?: unknown[] }).documents?.length === 0 && (
                      <p className="text-sm text-gray-500">
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
    </div>
  );
}
