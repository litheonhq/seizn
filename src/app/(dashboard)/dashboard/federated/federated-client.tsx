"use client";

import { useState, useEffect, useCallback } from "react";

type ConnectorType = "pinecone" | "weaviate" | "qdrant" | "milvus";

interface Connector {
  name: string;
  type: ConnectorType;
  enabled: boolean;
  health?: {
    healthy: boolean;
    latency_ms: number;
  };
}

interface ConnectorForm {
  type: ConnectorType;
  name: string;
  // Pinecone
  pinecone_apiKey: string;
  pinecone_environment: string;
  pinecone_indexName: string;
  pinecone_namespace: string;
  // Weaviate
  weaviate_host: string;
  weaviate_apiKey: string;
  weaviate_scheme: "http" | "https";
  weaviate_className: string;
}

export function FederatedClient() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<unknown>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [form, setForm] = useState<ConnectorForm>({
    type: "pinecone",
    name: "",
    pinecone_apiKey: "",
    pinecone_environment: "",
    pinecone_indexName: "",
    pinecone_namespace: "",
    weaviate_host: "",
    weaviate_apiKey: "",
    weaviate_scheme: "https",
    weaviate_className: "",
  });

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health" }),
      });
      const data = await response.json();
      if (data.success && data.connectors) {
        setConnectors((prev) =>
          prev.map((c) => ({
            ...c,
            health: data.connectors[c.name],
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load health:", error);
    }
  }, []);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/federated");
      const data = await response.json();
      if (data.success) {
        setConnectors(data.connectors || []);
        // Load health status
        await loadHealth();
      }
    } catch (error) {
      console.error("Failed to load connectors:", error);
    } finally {
      setLoading(false);
    }
  }, [loadHealth]);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const handleAddConnector = async () => {
    try {
      let config: Record<string, unknown>;

      if (form.type === "pinecone") {
        config = {
          type: "pinecone",
          name: form.name,
          enabled: true,
          priority: 1,
          weight: 1,
          config: {
            apiKey: form.pinecone_apiKey,
            environment: form.pinecone_environment,
            indexName: form.pinecone_indexName,
            namespace: form.pinecone_namespace || undefined,
          },
        };
      } else if (form.type === "weaviate") {
        config = {
          type: "weaviate",
          name: form.name,
          enabled: true,
          priority: 1,
          weight: 1,
          config: {
            host: form.weaviate_host,
            apiKey: form.weaviate_apiKey || undefined,
            scheme: form.weaviate_scheme,
            className: form.weaviate_className,
          },
        };
      } else {
        throw new Error("Unsupported connector type");
      }

      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", config }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddForm(false);
        loadConnectors();
        // Reset form
        setForm({
          type: "pinecone",
          name: "",
          pinecone_apiKey: "",
          pinecone_environment: "",
          pinecone_indexName: "",
          pinecone_namespace: "",
          weaviate_host: "",
          weaviate_apiKey: "",
          weaviate_scheme: "https",
          weaviate_className: "",
        });
      } else {
        alert(`Failed to add connector: ${data.error?.message}`);
      }
    } catch (error) {
      console.error("Failed to add connector:", error);
      alert("Failed to add connector");
    }
  };

  const handleRemoveConnector = async (name: string) => {
    if (!confirm(`Remove connector "${name}"?`)) return;

    try {
      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unregister", name }),
      });

      const data = await response.json();
      if (data.success) {
        loadConnectors();
      }
    } catch (error) {
      console.error("Failed to remove connector:", error);
    }
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;

    setTestLoading(true);
    try {
      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: testQuery,
          topK: 5,
          mergeStrategy: "interleave",
        }),
      });

      const data = await response.json();
      setTestResults(data);
    } catch (error) {
      console.error("Test search failed:", error);
      setTestResults({ error: "Search failed" });
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Federated Connectors</h1>
          <p className="text-gray-500 mt-1">
            Connect external vector databases for unified search
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
        >
          Add Connector
        </button>
      </div>

      {/* Connectors Grid */}
      {connectors.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="font-semibold text-gray-900 mb-2">No Connectors</h3>
          <p className="text-gray-500 mb-4">
            Add a connector to enable federated search across multiple vector databases
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
          >
            Add Your First Connector
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-8">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.name}
              connector={connector}
              onRemove={() => handleRemoveConnector(connector.name)}
              onRefresh={loadHealth}
            />
          ))}
        </div>
      )}

      {/* Test Search Section */}
      {connectors.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 mb-8">
          <h3 className="font-semibold text-gray-900 mb-4">Test Federated Search</h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Enter a test query..."
              className="flex-1 px-4 py-2 border rounded-lg"
              onKeyDown={(e) => e.key === "Enter" && handleTestSearch()}
            />
            <button
              onClick={handleTestSearch}
              disabled={testLoading || !testQuery.trim()}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {testLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {testResults !== null && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <pre className="text-sm overflow-auto max-h-96">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Add Connector Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Connector</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connector Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ConnectorType })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="pinecone">Pinecone</option>
                  <option value="weaviate">Weaviate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connector Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="my-pinecone"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {form.type === "pinecone" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={form.pinecone_apiKey}
                      onChange={(e) => setForm({ ...form, pinecone_apiKey: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Environment / Host
                    </label>
                    <input
                      type="text"
                      value={form.pinecone_environment}
                      onChange={(e) => setForm({ ...form, pinecone_environment: e.target.value })}
                      placeholder="us-east1-gcp or your-index.svc.pinecone.io"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Index Name
                    </label>
                    <input
                      type="text"
                      value={form.pinecone_indexName}
                      onChange={(e) => setForm({ ...form, pinecone_indexName: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Namespace (optional)
                    </label>
                    <input
                      type="text"
                      value={form.pinecone_namespace}
                      onChange={(e) => setForm({ ...form, pinecone_namespace: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </>
              )}

              {form.type === "weaviate" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      value={form.weaviate_host}
                      onChange={(e) => setForm({ ...form, weaviate_host: e.target.value })}
                      placeholder="your-instance.weaviate.network"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Scheme
                    </label>
                    <select
                      value={form.weaviate_scheme}
                      onChange={(e) =>
                        setForm({ ...form, weaviate_scheme: e.target.value as "http" | "https" })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="https">HTTPS</option>
                      <option value="http">HTTP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key (optional)
                    </label>
                    <input
                      type="password"
                      value={form.weaviate_apiKey}
                      onChange={(e) => setForm({ ...form, weaviate_apiKey: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Class Name
                    </label>
                    <input
                      type="text"
                      value={form.weaviate_className}
                      onChange={(e) => setForm({ ...form, weaviate_className: e.target.value })}
                      placeholder="Document"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddConnector}
                disabled={!form.name}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
              >
                Add Connector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectorCard({
  connector,
  onRemove,
  onRefresh,
}: {
  connector: Connector;
  onRemove: () => void;
  onRefresh: () => void;
}) {
  const typeLogos: Record<string, string> = {
    pinecone: "🌲",
    weaviate: "🔷",
    qdrant: "🔶",
    milvus: "🐋",
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{typeLogos[connector.type] || "🔗"}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{connector.name}</h3>
            <p className="text-sm text-gray-500 capitalize">{connector.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connector.health ? (
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                connector.health.healthy
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {connector.health.healthy ? "Healthy" : "Unhealthy"}
            </span>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
              Unknown
            </span>
          )}
        </div>
      </div>

      {connector.health && (
        <div className="text-sm text-gray-500 mb-3">
          Latency: {connector.health.latency_ms}ms
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Refresh
        </button>
        <button
          onClick={onRemove}
          className="text-sm text-red-600 hover:text-red-700"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
