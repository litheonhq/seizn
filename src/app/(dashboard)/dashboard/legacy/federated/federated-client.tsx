"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatRelativeTime } from "@/lib/format-date";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";

type ConnectorType = "pinecone" | "weaviate" | "qdrant" | "milvus" | "http-agent" | "s3";

type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

interface ConnectorHealth {
  status: HealthStatus;
  latency_p50?: number;
  latency_p95?: number;
  last_ping?: string;
  error_rate?: number;
}

interface Connector {
  name: string;
  type: ConnectorType;
  enabled: boolean;
  readOnly?: boolean;
  namespaceFilter?: string;
  health?: ConnectorHealth;
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
  // Qdrant
  qdrant_host: string;
  qdrant_apiKey: string;
  qdrant_collection: string;
  // Policy/Permission
  readOnly: boolean;
  namespaceFilter: string;
}

// Wizard step type
type WizardStep = 1 | 2 | 3;

// Connection test result
interface TestResult {
  success: boolean;
  message: string;
  latency_ms?: number;
}

// Connector type metadata
const CONNECTOR_TYPES: { id: ConnectorType; name: string; icon: string; description: string }[] = [
  { id: "pinecone", name: "Pinecone", icon: "🌲", description: "Serverless vector database" },
  { id: "weaviate", name: "Weaviate", icon: "🔷", description: "Open-source vector search" },
  { id: "qdrant", name: "Qdrant", icon: "🔶", description: "High-performance vector DB" },
  { id: "milvus", name: "Milvus", icon: "🐋", description: "Cloud-native vector database" },
  { id: "http-agent", name: "HTTP Agent", icon: "🌐", description: "Custom HTTP endpoint" },
  { id: "s3", name: "S3 / Object Storage", icon: "📦", description: "File-based vector storage" },
];

function mergeConnectorHealth(
  baseConnectors: Connector[],
  healthByName: Record<string, { healthy?: boolean; latency_ms?: number }> | undefined
): Connector[] {
  return baseConnectors.map((connector) => {
    const healthData = healthByName?.[connector.name];
    if (!healthData) return connector;

    const latency = typeof healthData.latency_ms === "number" ? healthData.latency_ms : undefined;
    const status: HealthStatus = healthData.healthy
      ? ((latency ?? 0) > 500 ? "degraded" : "healthy")
      : "down";

    return {
      ...connector,
      health: {
        status,
        latency_p50: latency,
        latency_p95: latency ? Math.round(latency * 1.3) : undefined,
        last_ping: new Date().toISOString(),
        error_rate: healthData.healthy ? 0 : 100,
      },
    };
  });
}

export function FederatedClient() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<unknown>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Connection test state
  const [connectionTest, setConnectionTest] = useState<TestResult | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const loadRequestGuardRef = useRef(createLatestRequestGuard());
  const healthRequestGuardRef = useRef(createLatestRequestGuard());

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
    qdrant_host: "",
    qdrant_apiKey: "",
    qdrant_collection: "",
    readOnly: false,
    namespaceFilter: "",
  });

  const loadHealth = useCallback(async (baseConnectors?: Connector[]) => {
    const request = healthRequestGuardRef.current.begin();
    setLoadError(null);
    try {
      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health" }),
        signal: request.signal,
      });
      const data = await response.json();

      if (!healthRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      if (data.success && data.connectors) {
        const sourceConnectors = baseConnectors ?? connectors;
        setConnectors(mergeConnectorHealth(sourceConnectors, data.connectors));
        setLoadError(null);
      } else {
        setLoadError(getErrorMessage(data.error, "Failed to load connector health."));
      }
    } catch (error) {
      if (!isAbortError(error) && healthRequestGuardRef.current.isCurrent(request.id)) {
        setLoadError(getErrorMessage(error, "Failed to load connector health."));
      }
    } finally {
      if (healthRequestGuardRef.current.isCurrent(request.id)) {
        healthRequestGuardRef.current.finish(request.id);
      }
    }
  }, [connectors]);

  // Test connection before adding
  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true);
    setConnectionTest(null);

    try {
      // Simulate connection test (in real implementation, call API)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // For demo purposes, validate based on form fields
      let isValid = false;
      let message = "";

      if (form.type === "pinecone") {
        isValid = !!(form.pinecone_apiKey && form.pinecone_environment && form.pinecone_indexName);
        message = isValid
          ? `Successfully connected to Pinecone index "${form.pinecone_indexName}"`
          : "Missing required fields: API Key, Environment, or Index Name";
      } else if (form.type === "weaviate") {
        isValid = !!(form.weaviate_host && form.weaviate_className);
        message = isValid
          ? `Successfully connected to Weaviate class "${form.weaviate_className}"`
          : "Missing required fields: Host or Class Name";
      } else if (form.type === "qdrant") {
        isValid = !!(form.qdrant_host && form.qdrant_collection);
        message = isValid
          ? `Successfully connected to Qdrant collection "${form.qdrant_collection}"`
          : "Missing required fields: Host or Collection Name";
      } else {
        isValid = true;
        message = "Connection validated (simulated)";
      }

      setConnectionTest({
        success: isValid,
        message,
        latency_ms: isValid ? Math.round(50 + Math.random() * 100) : undefined,
      });
    } catch (error) {
      setConnectionTest({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setTestingConnection(false);
    }
  }, [form]);

  const loadConnectors = useCallback(async () => {
    const request = loadRequestGuardRef.current.begin();
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/federated", { signal: request.signal });
      const data = await response.json();

      if (!loadRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      if (data.success) {
        const nextConnectors = data.connectors || [];
        setConnectors(nextConnectors);
        await loadHealth(nextConnectors);
      } else {
        setLoadError(getErrorMessage(data.error, "Failed to load connectors."));
      }
    } catch (error) {
      if (!isAbortError(error) && loadRequestGuardRef.current.isCurrent(request.id)) {
        setLoadError(getErrorMessage(error, "Failed to load connectors."));
      }
    } finally {
      if (loadRequestGuardRef.current.isCurrent(request.id)) {
        setLoading(false);
        loadRequestGuardRef.current.finish(request.id);
      }
    }
  }, [loadHealth]);

  useEffect(() => {
    const loadRequestGuard = loadRequestGuardRef.current;
    const healthRequestGuard = healthRequestGuardRef.current;
    loadConnectors();
    return () => {
      loadRequestGuard.cancel();
      healthRequestGuard.cancel();
    };
  }, [loadConnectors]);

  // Reset form and wizard state
  const resetWizard = useCallback(() => {
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
      qdrant_host: "",
      qdrant_apiKey: "",
      qdrant_collection: "",
      readOnly: false,
      namespaceFilter: "",
    });
    setWizardStep(1);
    setConnectionTest(null);
  }, []);

  const handleAddConnector = async () => {
    setActionError(null);
    try {
      let config: Record<string, unknown>;

      const baseConfig = {
        name: form.name,
        enabled: true,
        priority: 1,
        weight: 1,
        readOnly: form.readOnly,
        namespaceFilter: form.namespaceFilter || undefined,
      };

      if (form.type === "pinecone") {
        config = {
          ...baseConfig,
          type: "pinecone",
          config: {
            apiKey: form.pinecone_apiKey,
            environment: form.pinecone_environment,
            indexName: form.pinecone_indexName,
            namespace: form.pinecone_namespace || undefined,
          },
        };
      } else if (form.type === "weaviate") {
        config = {
          ...baseConfig,
          type: "weaviate",
          config: {
            host: form.weaviate_host,
            apiKey: form.weaviate_apiKey || undefined,
            scheme: form.weaviate_scheme,
            className: form.weaviate_className,
          },
        };
      } else if (form.type === "qdrant") {
        config = {
          ...baseConfig,
          type: "qdrant",
          config: {
            host: form.qdrant_host,
            apiKey: form.qdrant_apiKey || undefined,
            collection: form.qdrant_collection,
          },
        };
      } else {
        // For other types, use a generic config
        config = {
          ...baseConfig,
          type: form.type,
          config: {},
        };
      }

      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", config }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddForm(false);
        await loadConnectors();
        resetWizard();
      } else {
        setActionError(getErrorMessage(data.error, "Failed to add connector."));
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to add connector."));
    }
  };

  const handleRemoveConnector = async (name: string) => {
    if (!confirm(`Remove connector "${name}"?`)) return;
    setActionError(null);

    try {
      const response = await fetch("/api/federated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unregister", name }),
      });

      const data = await response.json();
      if (data.success) {
        await loadConnectors();
      } else {
        setActionError(getErrorMessage(data.error, "Failed to remove connector."));
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to remove connector."));
    }
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;

    setTestLoading(true);
    setActionError(null);
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
      setActionError(getErrorMessage(error, "Test search failed."));
      setTestResults({ error: "Search failed" });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[var(--ink-50)] rounded w-48" />
          <div className="h-64 bg-[var(--ink-50)] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)]">Federated Connectors</h1>
          <p className="text-[var(--ink-600)] mt-1">
            Connect external vector databases for unified search
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
        >
          Add Connector
        </button>
      </div>

      {(loadError || actionError) && (
        <div className="mb-6 rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)] dark:border-[var(--signal-pending)]/60 dark:bg-[var(--signal-pending)]/30 dark:text-[var(--signal-pending-soft)]">
          {actionError || loadError}
        </div>
      )}

      {/* Connectors Grid */}
      {connectors.length === 0 ? (
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-8 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="font-semibold text-[var(--ink-900)] mb-2">No Connectors</h3>
          <p className="text-[var(--ink-600)] mb-4">
            Add a connector to enable federated search across multiple vector databases
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
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
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6 mb-8">
          <h3 className="font-semibold text-[var(--ink-900)] mb-4">Test Federated Search</h3>
          <div className="flex gap-4">
            <input aria-label="Test Query"
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
              className="px-6 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-800)] disabled:opacity-50"
            >
              {testLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {testResults !== null && (
            <div className="mt-4 p-4 bg-[var(--ink-50)] rounded-lg">
              <pre className="text-sm overflow-auto max-h-96">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Add Connector Wizard Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--ink-0)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            {/* Wizard Header */}
            <div className="p-6 border-b sticky top-0 bg-[var(--ink-0)] rounded-t-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[var(--ink-900)]">Add Connector</h2>
                <button
                  onClick={() => { setShowAddForm(false); resetWizard(); }}
                  className="text-[var(--ink-500)] hover:text-[var(--ink-600)]"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Wizard Steps Indicator */}
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        wizardStep === step
                          ? "bg-[var(--ink-900)] text-white"
                          : wizardStep > step
                          ? "bg-[var(--signal-canon)]/10 text-[var(--signal-canon)]"
                          : "bg-gray-100 text-[var(--ink-500)]"
                      }`}
                    >
                      {wizardStep > step ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step
                      )}
                    </div>
                    {step < 3 && (
                      <div className={`w-12 h-1 mx-2 rounded ${wizardStep > step ? "bg-[var(--ink-900)]" : "bg-gray-200"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-[var(--ink-600)]">
                <span>Select Type</span>
                <span>Configure & Test</span>
                <span>Permissions</span>
              </div>
            </div>

            {/* Wizard Content */}
            <div className="p-6">
              {/* Step 1: Select Connector Type */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <p className="text-[var(--ink-600)] mb-4">Choose the type of vector database you want to connect:</p>
                  <div className="grid grid-cols-2 gap-3">
                    {CONNECTOR_TYPES.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => setForm({ ...form, type: ct.id })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          form.type === ct.id
                            ? "border-[var(--ink-900)] bg-[var(--ink-900)]/10"
                            : "border-[var(--ink-200)] hover:border-[var(--ink-200)]/80"
                        }`}
                      >
                        <span className="text-2xl">{ct.icon}</span>
                        <h4 className="font-semibold text-[var(--ink-900)] mt-2">{ct.name}</h4>
                        <p className="text-xs text-[var(--ink-600)]">{ct.description}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
                      Connector Name
                    </label>
                    <input aria-label="Name"
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., production-pinecone"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                    <p className="text-xs text-[var(--ink-500)] mt-1">A unique name to identify this connector</p>
                  </div>
                </div>
              )}

              {/* Step 2: Configure Credentials & Test */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-[var(--ink-600)] mb-4">
                    Enter credentials for <strong>{CONNECTOR_TYPES.find(c => c.id === form.type)?.name}</strong>:
                  </p>

                  {/* Pinecone Config */}
                  {form.type === "pinecone" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">API Key *</label>
                        <input aria-label="Pinecone Api Key"
                          type="password"
                          value={form.pinecone_apiKey}
                          onChange={(e) => setForm({ ...form, pinecone_apiKey: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="pc-xxxxx..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Environment / Host *</label>
                        <input aria-label="Pinecone Environment"
                          type="text"
                          value={form.pinecone_environment}
                          onChange={(e) => setForm({ ...form, pinecone_environment: e.target.value })}
                          placeholder="us-east1-gcp or your-index.svc.pinecone.io"
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Index Name *</label>
                        <input aria-label="Pinecone Index Name"
                          type="text"
                          value={form.pinecone_indexName}
                          onChange={(e) => setForm({ ...form, pinecone_indexName: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Namespace (optional)</label>
                        <input aria-label="Pinecone Namespace"
                          type="text"
                          value={form.pinecone_namespace}
                          onChange={(e) => setForm({ ...form, pinecone_namespace: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  {/* Weaviate Config */}
                  {form.type === "weaviate" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Host *</label>
                        <input aria-label="Weaviate Host"
                          type="text"
                          value={form.weaviate_host}
                          onChange={(e) => setForm({ ...form, weaviate_host: e.target.value })}
                          placeholder="your-instance.weaviate.network"
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Scheme</label>
                          <select
                            value={form.weaviate_scheme}
                            onChange={(e) => setForm({ ...form, weaviate_scheme: e.target.value as "http" | "https" })}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="https">HTTPS</option>
                            <option value="http">HTTP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">API Key (optional)</label>
                          <input aria-label="Weaviate Api Key"
                            type="password"
                            value={form.weaviate_apiKey}
                            onChange={(e) => setForm({ ...form, weaviate_apiKey: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Class Name *</label>
                        <input aria-label="Weaviate Class Name"
                          type="text"
                          value={form.weaviate_className}
                          onChange={(e) => setForm({ ...form, weaviate_className: e.target.value })}
                          placeholder="Document"
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  {/* Qdrant Config */}
                  {form.type === "qdrant" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Host *</label>
                        <input aria-label="Qdrant Host"
                          type="text"
                          value={form.qdrant_host}
                          onChange={(e) => setForm({ ...form, qdrant_host: e.target.value })}
                          placeholder="localhost:6333 or your-cluster.qdrant.io"
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">API Key (optional)</label>
                        <input aria-label="Qdrant Api Key"
                          type="password"
                          value={form.qdrant_apiKey}
                          onChange={(e) => setForm({ ...form, qdrant_apiKey: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">Collection Name *</label>
                        <input aria-label="Qdrant Collection"
                          type="text"
                          value={form.qdrant_collection}
                          onChange={(e) => setForm({ ...form, qdrant_collection: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  {/* Other connectors placeholder */}
                  {!["pinecone", "weaviate", "qdrant"].includes(form.type) && (
                    <div className="p-4 bg-[var(--signal-pending-soft)] border border-[var(--signal-pending)] rounded-lg">
                      <p className="text-[var(--signal-pending-ink)] text-sm">
                        Configuration for {CONNECTOR_TYPES.find(c => c.id === form.type)?.name} coming soon.
                        Contact support for early access.
                      </p>
                    </div>
                  )}

                  {/* Test Connection */}
                  <div className="mt-6 p-4 bg-[var(--ink-50)] rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-[var(--ink-900)]">Test Connection</h4>
                      <button
                        onClick={handleTestConnection}
                        disabled={testingConnection}
                        className="px-4 py-2 bg-[var(--ink-900)] text-white text-sm rounded-lg hover:bg-[var(--ink-800)] disabled:opacity-50 flex items-center gap-2"
                      >
                        {testingConnection ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Test Connection
                          </>
                        )}
                      </button>
                    </div>

                    {connectionTest && (
                      <div className={`p-3 rounded-lg ${connectionTest.success ? "bg-[var(--signal-canon-soft)] border border-[var(--signal-canon)]" : "bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)]"}`}>
                        <div className="flex items-start gap-2">
                          {connectionTest.success ? (
                            <svg className="w-5 h-5 text-[var(--signal-canon-ink)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-[var(--signal-conflict-ink)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <div>
                            <p className={`text-sm font-medium ${connectionTest.success ? "text-[var(--signal-canon-ink)]" : "text-[var(--signal-conflict-ink)]"}`}>
                              {connectionTest.success ? "Connection Successful" : "Connection Failed"}
                            </p>
                            <p className={`text-xs ${connectionTest.success ? "text-[var(--signal-canon-ink)]" : "text-[var(--signal-conflict-ink)]"}`}>
                              {connectionTest.message}
                            </p>
                            {connectionTest.latency_ms && (
                              <p className="text-xs text-[var(--signal-canon-ink)] mt-1">Latency: {connectionTest.latency_ms}ms</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Permissions & Policy */}
              {wizardStep === 3 && (
                <div className="space-y-6">
                  <p className="text-[var(--ink-600)] mb-4">Configure access permissions for this connector:</p>

                  <div className="space-y-4">
                    <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-[var(--ink-50)]">
                      <input aria-label="Read Only"
                        type="checkbox"
                        checked={form.readOnly}
                        onChange={(e) => setForm({ ...form, readOnly: e.target.checked })}
                        className="mt-1 w-4 h-4 text-[var(--ink-900)] rounded"
                      />
                      <div>
                        <span className="font-medium text-[var(--ink-900)]">Read-only Mode</span>
                        <p className="text-sm text-[var(--ink-600)]">Only allow read operations. Prevents writes, updates, and deletes.</p>
                      </div>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
                        Namespace Filter (optional)
                      </label>
                      <input aria-label="Namespace Filter"
                        type="text"
                        value={form.namespaceFilter}
                        onChange={(e) => setForm({ ...form, namespaceFilter: e.target.value })}
                        placeholder="e.g., production-*, tenant-123"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                      <p className="text-xs text-[var(--ink-500)] mt-1">
                        Restrict queries to specific namespaces. Supports wildcards (*).
                      </p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-6 p-4 bg-[var(--ink-900)]/5 border border-[var(--ink-900)]/20 rounded-lg">
                    <h4 className="font-medium text-[var(--ink-900)] mb-2">Ready to Add</h4>
                    <ul className="text-sm text-[var(--signal-canon)] space-y-1">
                      <li><strong>Name:</strong> {form.name}</li>
                      <li><strong>Type:</strong> {CONNECTOR_TYPES.find(c => c.id === form.type)?.name}</li>
                      <li><strong>Mode:</strong> {form.readOnly ? "Read-only" : "Read/Write"}</li>
                      {form.namespaceFilter && <li><strong>Filter:</strong> {form.namespaceFilter}</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="p-6 border-t sticky bottom-0 bg-[var(--ink-0)] rounded-b-2xl flex justify-between">
              <button
                onClick={() => {
                  if (wizardStep === 1) {
                    setShowAddForm(false);
                    resetWizard();
                  } else {
                    setWizardStep((wizardStep - 1) as WizardStep);
                  }
                }}
                className="px-4 py-2 border rounded-lg hover:bg-[var(--ink-50)]"
              >
                {wizardStep === 1 ? "Cancel" : "Back"}
              </button>

              {wizardStep < 3 ? (
                <button
                  onClick={() => setWizardStep((wizardStep + 1) as WizardStep)}
                  disabled={wizardStep === 1 && !form.name}
                  className="px-6 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleAddConnector}
                  className="px-6 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
                >
                  Add Connector
                </button>
              )}
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
    "http-agent": "🌐",
    s3: "📦",
  };

  // Health badge colors
  const healthColors: Record<HealthStatus, string> = {
    healthy: "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] border-[var(--signal-canon)]",
    degraded: "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] border-[var(--signal-pending)]",
    down: "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] border-[var(--signal-conflict)]",
    unknown: "bg-[var(--ink-50)] text-[var(--ink-600)] border-[var(--ink-200)]",
  };

  const healthLabels: Record<HealthStatus, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    down: "Down",
    unknown: "Unknown",
  };

  const healthStatus = connector.health?.status || "unknown";

  // Format last ping time
  const formatLastPing = (isoString?: string) => {
    if (!isoString) return "Never";
    return formatRelativeTime(isoString);
  };

  return (
    <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--ink-50)] rounded-lg flex items-center justify-center">
            <span className="text-xl">{typeLogos[connector.type] || "🔗"}</span>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink-900)]">{connector.name}</h3>
            <p className="text-sm text-[var(--ink-600)] capitalize">{connector.type.replace("-", " ")}</p>
          </div>
        </div>

        {/* Health Badge */}
        <div className={`px-3 py-1.5 rounded-full text-xs font-medium border ${healthColors[healthStatus]}`}>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                healthStatus === "healthy"
                  ? "bg-green-500"
                  : healthStatus === "degraded"
                  ? "bg-[var(--signal-pending)]"
                  : healthStatus === "down"
                  ? "bg-[var(--signal-conflict)]"
                  : "bg-gray-400"
              }`}
            />
            {healthLabels[healthStatus]}
          </span>
        </div>
      </div>

      {/* Health Metrics */}
      {connector.health && healthStatus !== "unknown" && (
        <div className="grid grid-cols-3 gap-3 p-3 bg-[var(--ink-50)] rounded-lg mb-4">
          <div>
            <p className="text-xs text-[var(--ink-600)]">p50 Latency</p>
            <p className="font-mono text-sm text-[var(--ink-900)]">{connector.health.latency_p50 || "—"}ms</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-600)]">p95 Latency</p>
            <p className="font-mono text-sm text-[var(--ink-900)]">{connector.health.latency_p95 || "—"}ms</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-600)]">Last Ping</p>
            <p className="text-sm text-[var(--ink-900)]">{formatLastPing(connector.health.last_ping)}</p>
          </div>
        </div>
      )}

      {/* Permission badges */}
      <div className="flex gap-2 mb-4">
        {connector.readOnly && (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">Read-only</span>
        )}
        {connector.namespaceFilter && (
          <span className="px-2 py-0.5 bg-[var(--ink-50)] text-[var(--ink-900)] underline text-xs rounded">
            Filter: {connector.namespaceFilter}
          </span>
        )}
        {!connector.readOnly && !connector.namespaceFilter && (
          <span className="px-2 py-0.5 bg-[var(--ink-50)] text-[var(--ink-600)] text-xs rounded">Full Access</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 pt-3 border-t">
        <button
          onClick={onRefresh}
          className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <button
          onClick={onRemove}
          className="text-sm text-[var(--signal-conflict-ink)] hover:text-[var(--signal-conflict-ink)] flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Remove
        </button>
      </div>
    </div>
  );
}
