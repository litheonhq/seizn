"use client";

import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    answer?: string;
    sources?: Array<{ id: string; content: string }>;
    trace?: { trace_id: string; total_ms: number; cost_usd: number; share_url: string };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Query failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Seizn RAG Demo</h1>
      <p className="text-gray-600 mb-8">
        Ask questions and get answers with full traceability
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Ask"}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-6">
          {/* Answer */}
          {result.answer && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h2 className="font-semibold text-green-800 mb-2">Answer</h2>
              <p className="text-gray-800">{result.answer}</p>
            </div>
          )}

          {/* Sources */}
          {result.sources && result.sources.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Sources</h2>
              <div className="space-y-2">
                {result.sources.map((source, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded border text-sm">
                    <span className="text-gray-500">[{source.id}]</span>{" "}
                    {source.content.slice(0, 150)}...
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trace Info */}
          {result.trace && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h2 className="font-semibold text-blue-800 mb-2">Debug Trace</h2>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Latency:</span>{" "}
                  <span className="font-mono">{result.trace.total_ms}ms</span>
                </div>
                <div>
                  <span className="text-gray-500">Cost:</span>{" "}
                  <span className="font-mono">${result.trace.cost_usd.toFixed(6)}</span>
                </div>
                <div>
                  <a
                    href={result.trace.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View Full Trace →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
