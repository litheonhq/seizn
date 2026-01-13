"use client";

import { useState, useEffect, useCallback } from "react";

type TabType = "audit" | "keys" | "settings";

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  type: "live" | "test";
  created_at: string;
  last_used_at?: string;
  permissions: string[];
}

export function SecurityClient() {
  const [activeTab, setActiveTab] = useState<TabType>("audit");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [dateRange, setDateRange] = useState("7d");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "audit") {
        const params = new URLSearchParams({ limit: "100" });
        if (actionFilter) params.append("action", actionFilter);

        const response = await fetch(`/api/security/audit?${params}`);
        const data = await response.json();
        if (data.success) {
          setAuditLogs(data.logs || []);
        }
      } else if (activeTab === "keys") {
        // Mock API keys - would come from /api/keys endpoint
        setApiKeys([
          {
            id: "1",
            name: "Production Key",
            key_prefix: "szn_live_abc",
            type: "live",
            created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
            last_used_at: new Date().toISOString(),
            permissions: ["read", "write", "delete"],
          },
          {
            id: "2",
            name: "Development Key",
            key_prefix: "szn_test_xyz",
            type: "test",
            created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
            last_used_at: new Date(Date.now() - 3600000).toISOString(),
            permissions: ["read", "write"],
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, actionFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRotateKey = async (_keyId: string) => {
    if (!confirm("Are you sure you want to rotate this API key? The old key will be invalidated.")) {
      return;
    }
    // Would call /api/keys/rotate endpoint
    alert("Key rotated successfully! Please copy your new key.");
    loadData();
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }
    // Would call /api/keys/revoke endpoint
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Security</h1>
        <p className="text-gray-500 mt-1">
          Manage API keys and view security audit logs
        </p>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔐</span>
            <span className="text-sm text-gray-500">Active API Keys</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{apiKeys.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📋</span>
            <span className="text-sm text-gray-500">Audit Events (24h)</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {auditLogs.filter(
              (l) => new Date(l.created_at).getTime() > Date.now() - 86400000
            ).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🛡️</span>
            <span className="text-sm text-gray-500">Security Score</span>
          </div>
          <p className="text-2xl font-bold text-green-600">A+</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm text-gray-500">Alerts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(["audit", "keys", "settings"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "audit" && "Audit Log"}
            {tab === "keys" && "API Keys"}
            {tab === "settings" && "Settings"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : (
        <>
          {activeTab === "audit" && (
            <AuditLogTable
              logs={auditLogs}
              actionFilter={actionFilter}
              onActionFilterChange={setActionFilter}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          )}
          {activeTab === "keys" && (
            <ApiKeysTable
              keys={apiKeys}
              onRotate={handleRotateKey}
              onRevoke={handleRevokeKey}
            />
          )}
          {activeTab === "settings" && <SecuritySettings />}
        </>
      )}
    </div>
  );
}

function AuditLogTable({
  logs,
  actionFilter,
  onActionFilterChange,
  dateRange,
  onDateRangeChange,
}: {
  logs: AuditLog[];
  actionFilter: string;
  onActionFilterChange: (v: string) => void;
  dateRange: string;
  onDateRangeChange: (v: string) => void;
}) {
  // Get unique actions for filter
  const actions = [...new Set(logs.map((l) => l.action))];

  const getActionIcon = (action: string) => {
    if (action.includes("created")) return "➕";
    if (action.includes("deleted")) return "🗑️";
    if (action.includes("updated")) return "✏️";
    if (action.includes("login")) return "🔓";
    if (action.includes("logout")) return "🔒";
    if (action.includes("rotated")) return "🔄";
    return "📋";
  };

  const getActionColor = (action: string) => {
    if (action.includes("deleted") || action.includes("revoked")) return "text-red-600";
    if (action.includes("created") || action.includes("login")) return "text-green-600";
    if (action.includes("updated") || action.includes("rotated")) return "text-blue-600";
    return "text-gray-600";
  };

  return (
    <div className="bg-white rounded-2xl border">
      {/* Filters */}
      <div className="p-4 border-b flex gap-4">
        <select
          value={actionFilter}
          onChange={(e) => onActionFilterChange(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="1h">Last hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <button className="ml-auto px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
          Export CSV
        </button>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Action
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Resource
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Details
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              IP Address
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className={`flex items-center gap-2 text-sm ${getActionColor(log.action)}`}>
                  <span>{getActionIcon(log.action)}</span>
                  {log.action}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-600">{log.resource}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500 font-mono">
                  {JSON.stringify(log.details).slice(0, 50)}...
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm font-mono text-gray-600">{log.ip_address}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <div className="p-8 text-center text-gray-500">No audit logs found</div>
      )}
    </div>
  );
}

function ApiKeysTable({
  keys,
  onRotate,
  onRevoke,
}: {
  keys: ApiKey[];
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          API keys are used to authenticate requests to the Seizn API
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
        >
          Create New Key
        </button>
      </div>

      <div className="space-y-4">
        {keys.map((key) => (
          <div key={key.id} className="bg-white rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{key.name}</h3>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      key.type === "live"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {key.type}
                  </span>
                </div>
                <p className="text-sm font-mono text-gray-500 mt-1">
                  {key.key_prefix}...
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRotate(key.id)}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Rotate
                </button>
                <button
                  onClick={() => onRevoke(key.id)}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Created</span>
                <p className="text-gray-900">
                  {new Date(key.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Last Used</span>
                <p className="text-gray-900">
                  {key.last_used_at
                    ? new Date(key.last_used_at).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Permissions</span>
                <p className="text-gray-900">{key.permissions.join(", ")}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <CreateKeyModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"live" | "test">("test");

  const handleCreate = () => {
    // Would call /api/keys/create endpoint
    alert("API key created! Copy it now as it won't be shown again.");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create API Key</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Backend"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="test"
                  checked={type === "test"}
                  onChange={() => setType("test")}
                />
                <span className="text-sm">Test</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="live"
                  checked={type === "live"}
                  onChange={() => setType("live")}
                />
                <span className="text-sm">Live</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Test keys only work in sandbox mode
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name}
            className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            Create Key
          </button>
        </div>
      </div>
    </div>
  );
}

function SecuritySettings() {
  const [settings, setSettings] = useState({
    twoFactorEnabled: false,
    ipWhitelist: false,
    sessionTimeout: 30,
    apiRateLimit: 1000,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Authentication</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-sm text-gray-500">
                Require 2FA for all team members
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, twoFactorEnabled: !settings.twoFactorEnabled })
              }
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.twoFactorEnabled ? "bg-emerald-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.twoFactorEnabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Session Timeout</p>
              <p className="text-sm text-gray-500">
                Automatically log out after inactivity
              </p>
            </div>
            <select
              value={settings.sessionTimeout}
              onChange={(e) =>
                setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">API Security</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">IP Whitelist</p>
              <p className="text-sm text-gray-500">
                Only allow API access from specific IPs
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, ipWhitelist: !settings.ipWhitelist })
              }
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.ipWhitelist ? "bg-emerald-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.ipWhitelist ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Rate Limit</p>
              <p className="text-sm text-gray-500">
                Maximum requests per minute
              </p>
            </div>
            <select
              value={settings.apiRateLimit}
              onChange={(e) =>
                setSettings({ ...settings, apiRateLimit: parseInt(e.target.value) })
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value={100}>100/min</option>
              <option value={500}>500/min</option>
              <option value={1000}>1,000/min</option>
              <option value={5000}>5,000/min</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-6">
        <h3 className="font-semibold text-yellow-800 mb-2">Danger Zone</h3>
        <p className="text-sm text-yellow-700 mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <div className="flex gap-4">
          <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
            Revoke All API Keys
          </button>
          <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
            Delete All Data
          </button>
        </div>
      </div>
    </div>
  );
}
