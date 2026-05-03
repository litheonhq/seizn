"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";

type TabType = "audit" | "keys" | "policies" | "settings";

// Security policy types
interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "pending";
  type: "access" | "data" | "compliance";
  lastUpdated: string;
  conditions: string[];
}

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
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [dateRange, setDateRange] = useState("7d");

  const { t } = useDashboardTranslation();

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
      } else if (activeTab === "policies") {
        // Mock security policies
        setPolicies([
          {
            id: "pol-1",
            name: "API Rate Limiting",
            description: "Limit API requests per minute to prevent abuse",
            status: "active",
            type: "access",
            lastUpdated: new Date(Date.now() - 86400000 * 3).toISOString(),
            conditions: ["Max 1000 req/min", "Burst: 2000 req/10s"],
          },
          {
            id: "pol-2",
            name: "Data Encryption at Rest",
            description: "All stored data must be encrypted using AES-256",
            status: "active",
            type: "data",
            lastUpdated: new Date(Date.now() - 86400000 * 30).toISOString(),
            conditions: ["AES-256 encryption", "Key rotation every 90 days"],
          },
          {
            id: "pol-3",
            name: "GDPR Compliance",
            description: "Ensure data handling complies with GDPR requirements",
            status: "active",
            type: "compliance",
            lastUpdated: new Date(Date.now() - 86400000 * 7).toISOString(),
            conditions: ["Data retention: 30 days", "Right to deletion", "Export on request"],
          },
          {
            id: "pol-4",
            name: "IP Whitelist",
            description: "Restrict API access to approved IP addresses only",
            status: "inactive",
            type: "access",
            lastUpdated: new Date(Date.now() - 86400000 * 14).toISOString(),
            conditions: ["Approved IPs only", "Block suspicious regions"],
          },
          {
            id: "pol-5",
            name: "SOC 2 Type II",
            description: "Security controls for SOC 2 Type II certification",
            status: "pending",
            type: "compliance",
            lastUpdated: new Date(Date.now() - 86400000 * 2).toISOString(),
            conditions: ["Access logging", "Incident response", "Change management"],
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, actionFilter]);

  // Export audit logs to CSV
  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      // Fetch all logs for export
      const response = await fetch(`/api/security/audit?limit=10000`);
      const data = await response.json();
      const logs = data.logs || auditLogs;

      // Generate CSV content
      const headers = ["ID", "Action", "Resource", "Details", "IP Address", "User Agent", "Timestamp"];
      const rows = logs.map((log: AuditLog) => [
        log.id,
        log.action,
        log.resource,
        JSON.stringify(log.details).replace(/"/g, '""'),
        log.ip_address,
        log.user_agent,
        new Date(log.created_at).toISOString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(",")),
      ].join("\n");

      // Download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `seizn-audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to export:", error);
    } finally {
      setExporting(false);
    }
  }, [auditLogs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRotateKey = async (_keyId: string) => {
    if (!confirm(t("dashboard.securityPage.keys.confirmRotate"))) {
      return;
    }
    // Would call /api/keys/rotate endpoint
    alert(t("dashboard.securityPage.keys.rotateSuccess"));
    loadData();
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm(t("dashboard.securityPage.keys.confirmRevoke"))) {
      return;
    }
    // Would call /api/keys/revoke endpoint
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">{t("dashboard.securityPage.title")}</h1>
        <p className="text-[var(--ink-600)] mt-1">
          {t("dashboard.securityPage.subtitle")}
        </p>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔐</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.securityPage.stats.activeKeys")}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">{apiKeys.length}</p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📋</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.securityPage.stats.auditEvents")}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">
            {auditLogs.filter(
              (l) => new Date(l.created_at).getTime() > Date.now() - 86400000
            ).length}
          </p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🛡️</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.securityPage.stats.securityScore")}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--signal-canon-ink)]">A+</p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.securityPage.stats.alerts")}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">0</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--ink-50)] rounded-lg p-1 w-fit">
        {(["audit", "keys", "policies", "settings"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            }`}
          >
            {tab === "audit" && t("dashboard.securityPage.tabs.audit")}
            {tab === "keys" && t("dashboard.securityPage.tabs.keys")}
            {tab === "policies" && t("dashboard.securityPage.tabs.policies")}
            {tab === "settings" && t("dashboard.securityPage.tabs.settings")}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--ink-900)] border-t-transparent rounded-full mx-auto" />
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
              onExport={handleExportCSV}
              exporting={exporting}
            />
          )}
          {activeTab === "keys" && (
            <ApiKeysTable
              keys={apiKeys}
              onRotate={handleRotateKey}
              onRevoke={handleRevokeKey}
            />
          )}
          {activeTab === "policies" && (
            <PoliciesPanel policies={policies} onToggle={(id) => {
              setPolicies(prev => prev.map(p =>
                p.id === id ? { ...p, status: p.status === "active" ? "inactive" : "active" } : p
              ));
            }} />
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
  onExport,
  exporting,
}: {
  logs: AuditLog[];
  actionFilter: string;
  onActionFilterChange: (v: string) => void;
  dateRange: string;
  onDateRangeChange: (v: string) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { t } = useDashboardTranslation();

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
    if (action.includes("deleted") || action.includes("revoked")) return "text-[var(--signal-conflict-ink)]";
    if (action.includes("created") || action.includes("login")) return "text-[var(--signal-canon-ink)]";
    if (action.includes("updated") || action.includes("rotated")) return "text-blue-600";
    return "text-gray-600";
  };

  return (
    <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)]">
      {/* Filters */}
      <div className="p-4 border-b border-[var(--ink-200)] flex gap-4">
        <select
          value={actionFilter}
          onChange={(e) => onActionFilterChange(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">{t("dashboard.securityPage.audit.allActions")}</option>
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
          <option value="1h">{t("dashboard.securityPage.audit.lastHour")}</option>
          <option value="24h">{t("dashboard.securityPage.audit.last24Hours")}</option>
          <option value="7d">{t("dashboard.securityPage.audit.last7Days")}</option>
          <option value="30d">{t("dashboard.securityPage.audit.last30Days")}</option>
        </select>
        <button
          onClick={onExport}
          disabled={exporting || logs.length === 0}
          className="ml-auto px-4 py-2 border border-[var(--ink-200)] rounded-lg text-sm hover:bg-[var(--ink-50)] disabled:opacity-50 flex items-center gap-2"
        >
          {exporting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t("dashboard.securityPage.audit.exporting")}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t("dashboard.securityPage.audit.exportCSV")}
            </>
          )}
        </button>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead className="bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              {t("dashboard.securityPage.audit.action")}
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              {t("dashboard.securityPage.audit.resource")}
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              {t("dashboard.securityPage.audit.details")}
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              {t("dashboard.securityPage.audit.ipAddress")}
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              {t("dashboard.securityPage.audit.time")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ink-200)]">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-[var(--ink-50)]">
              <td className="px-4 py-3">
                <span className={`flex items-center gap-2 text-sm ${getActionColor(log.action)}`}>
                  <span>{getActionIcon(log.action)}</span>
                  {log.action}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">{log.resource}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)] font-mono">
                  {JSON.stringify(log.details).slice(0, 50)}...
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm font-mono text-[var(--ink-600)]">{log.ip_address}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <div className="p-8 text-center text-[var(--ink-600)]">{t("dashboard.securityPage.audit.noLogs")}</div>
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
  const { t } = useDashboardTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--ink-600)]">
          {t("dashboard.securityPage.keys.description")}
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
        >
          {t("dashboard.securityPage.keys.createNew")}
        </button>
      </div>

      <div className="space-y-4">
        {keys.map((key) => (
          <div key={key.id} className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[var(--ink-900)]">{key.name}</h3>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      key.type === "live"
                        ? "bg-[var(--signal-canon)]/10 text-[var(--signal-canon)]"
                        : "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)]"
                    }`}
                  >
                    {key.type}
                  </span>
                </div>
                <p className="text-sm font-mono text-[var(--ink-600)] mt-1">
                  {key.key_prefix}...
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRotate(key.id)}
                  className="px-3 py-1.5 text-sm border border-[var(--ink-200)] rounded-lg hover:bg-[var(--ink-50)]"
                >
                  {t("dashboard.securityPage.keys.rotate")}
                </button>
                <button
                  onClick={() => onRevoke(key.id)}
                  className="px-3 py-1.5 text-sm border border-[var(--signal-conflict)] text-[var(--signal-conflict-ink)] rounded-lg hover:bg-[var(--signal-conflict-soft)]"
                >
                  {t("dashboard.securityPage.keys.revoke")}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[var(--ink-600)]">{t("dashboard.securityPage.keys.created")}</span>
                <p className="text-[var(--ink-900)]">
                  {formatDate(key.created_at)}
                </p>
              </div>
              <div>
                <span className="text-[var(--ink-600)]">{t("dashboard.securityPage.keys.lastUsed")}</span>
                <p className="text-[var(--ink-900)]">
                  {key.last_used_at
                    ? new Date(key.last_used_at).toLocaleString()
                    : t("dashboard.securityPage.keys.never")}
                </p>
              </div>
              <div>
                <span className="text-[var(--ink-600)]">{t("dashboard.securityPage.keys.permissions")}</span>
                <p className="text-[var(--ink-900)]">{key.permissions.join(", ")}</p>
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
  const { t } = useDashboardTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<"live" | "test">("test");

  const handleCreate = () => {
    // Would call /api/keys/create endpoint
    alert(t("dashboard.securityPage.keys.createSuccess"));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--ink-0)] rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-[var(--ink-900)] mb-4">{t("dashboard.securityPage.keys.createTitle")}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
              {t("dashboard.securityPage.keys.keyName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dashboard.securityPage.keys.keyNamePlaceholder")}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
              {t("dashboard.securityPage.keys.keyType")}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="test"
                  checked={type === "test"}
                  onChange={() => setType("test")}
                />
                <span className="text-sm">{t("dashboard.securityPage.keys.test")}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="live"
                  checked={type === "live"}
                  onChange={() => setType("live")}
                />
                <span className="text-sm">{t("dashboard.securityPage.keys.live")}</span>
              </label>
            </div>
            <p className="text-xs text-[var(--ink-600)] mt-1">
              {t("dashboard.securityPage.keys.testKeysNote")}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[var(--ink-200)] rounded-lg hover:bg-[var(--ink-50)]"
          >
            {t("dashboard.securityPage.keys.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!name}
            className="flex-1 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90 disabled:opacity-50"
          >
            {t("dashboard.securityPage.keys.createKey")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SecuritySettings() {
  const { t } = useDashboardTranslation();
  const [settings, setSettings] = useState({
    twoFactorEnabled: false,
    ipWhitelist: false,
    sessionTimeout: 30,
    apiRateLimit: 1000,
  });

  return (
    <div className="space-y-6">
      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
        <h3 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.securityPage.settings.authentication")}</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--ink-900)]">{t("dashboard.securityPage.settings.twoFactor")}</p>
              <p className="text-sm text-[var(--ink-600)]">
                {t("dashboard.securityPage.settings.twoFactorDescription")}
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, twoFactorEnabled: !settings.twoFactorEnabled })
              }
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.twoFactorEnabled ? "bg-[var(--ink-900)]" : "bg-gray-200"
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
              <p className="font-medium text-[var(--ink-900)]">{t("dashboard.securityPage.settings.sessionTimeout")}</p>
              <p className="text-sm text-[var(--ink-600)]">
                {t("dashboard.securityPage.settings.sessionTimeoutDescription")}
              </p>
            </div>
            <select
              value={settings.sessionTimeout}
              onChange={(e) =>
                setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value={15}>{t("dashboard.securityPage.settings.15minutes")}</option>
              <option value={30}>{t("dashboard.securityPage.settings.30minutes")}</option>
              <option value={60}>{t("dashboard.securityPage.settings.1hour")}</option>
              <option value={240}>{t("dashboard.securityPage.settings.4hours")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
        <h3 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.securityPage.settings.apiSecurity")}</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--ink-900)]">{t("dashboard.securityPage.settings.ipWhitelist")}</p>
              <p className="text-sm text-[var(--ink-600)]">
                {t("dashboard.securityPage.settings.ipWhitelistDescription")}
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, ipWhitelist: !settings.ipWhitelist })
              }
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.ipWhitelist ? "bg-[var(--ink-900)]" : "bg-gray-200"
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
              <p className="font-medium text-[var(--ink-900)]">{t("dashboard.securityPage.settings.rateLimit")}</p>
              <p className="text-sm text-[var(--ink-600)]">
                {t("dashboard.securityPage.settings.rateLimitDescription")}
              </p>
            </div>
            <select
              value={settings.apiRateLimit}
              onChange={(e) =>
                setSettings({ ...settings, apiRateLimit: parseInt(e.target.value) })
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value={100}>{t("dashboard.securityPage.settings.rate100")}</option>
              <option value={500}>{t("dashboard.securityPage.settings.rate500")}</option>
              <option value={1000}>{t("dashboard.securityPage.settings.rate1000")}</option>
              <option value={5000}>{t("dashboard.securityPage.settings.rate5000")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[var(--signal-pending-soft)] rounded-lg border border-[var(--signal-pending)] p-6">
        <h3 className="font-semibold text-[var(--signal-pending-ink)] mb-2">{t("dashboard.securityPage.settings.dangerZone")}</h3>
        <p className="text-sm text-[var(--signal-pending-ink)] mb-4">
          {t("dashboard.securityPage.settings.dangerZoneDescription")}
        </p>
        <div className="flex gap-4">
          <button className="px-4 py-2 border border-[var(--signal-conflict)] text-[var(--signal-conflict-ink)] rounded-lg hover:bg-[var(--signal-conflict-soft)]">
            {t("dashboard.securityPage.settings.revokeAllKeys")}
          </button>
          <button className="px-4 py-2 border border-[var(--signal-conflict)] text-[var(--signal-conflict-ink)] rounded-lg hover:bg-[var(--signal-conflict-soft)]">
            {t("dashboard.securityPage.settings.deleteAllData")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PoliciesPanel({
  policies,
  onToggle,
}: {
  policies: SecurityPolicy[];
  onToggle: (id: string) => void;
}) {
  const { t } = useDashboardTranslation();

  const getStatusBadge = (status: SecurityPolicy["status"]) => {
    switch (status) {
      case "active":
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] border border-[var(--signal-canon)]">
            {t("dashboard.securityPage.policies.active")}
          </span>
        );
      case "inactive":
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            {t("dashboard.securityPage.policies.inactive")}
          </span>
        );
      case "pending":
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] border border-[var(--signal-pending)]">
            {t("dashboard.securityPage.policies.pending")}
          </span>
        );
    }
  };

  const getTypeIcon = (type: SecurityPolicy["type"]) => {
    switch (type) {
      case "access":
        return (
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        );
      case "data":
        return (
          <div className="w-10 h-10 bg-[var(--ink-100)] rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--ink-900)] underline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
        );
      case "compliance":
        return (
          <div className="w-10 h-10 bg-[var(--ink-900)]/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--ink-900)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        );
    }
  };

  // Group policies by type
  const groupedPolicies = {
    access: policies.filter((p) => p.type === "access"),
    data: policies.filter((p) => p.type === "data"),
    compliance: policies.filter((p) => p.type === "compliance"),
  };

  const activePolicies = policies.filter((p) => p.status === "active").length;
  const totalPolicies = policies.length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-[var(--signal-canon)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--signal-canon-ink)]">{t("dashboard.securityPage.policies.activePolicies")}</p>
              <p className="text-2xl font-bold text-[var(--signal-canon-ink)]">{activePolicies}/{totalPolicies}</p>
            </div>
            <div className="w-12 h-12 bg-[var(--signal-canon-soft)] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--signal-canon-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[var(--ink-50)] to-[var(--ink-100)] rounded-xl border border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700">{t("dashboard.securityPage.policies.accessPolicies")}</p>
              <p className="text-2xl font-bold text-blue-900">{groupedPolicies.access.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[var(--ink-50)] to-[var(--ink-100)] rounded-xl border border-[var(--ink-900)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--ink-900)] underline">{t("dashboard.securityPage.policies.compliancePolicies")}</p>
              <p className="text-2xl font-bold text-[var(--ink-900)]">{groupedPolicies.compliance.length}</p>
            </div>
            <div className="w-12 h-12 bg-[var(--ink-100)] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--ink-900)] underline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Policies List */}
      <div className="space-y-4">
        {policies.map((policy) => (
          <div
            key={policy.id}
            className={`bg-[var(--ink-0)] rounded-xl border p-5 transition-all ${
              policy.status === "active" ? "border-[var(--signal-canon)]" : "border-[var(--ink-200)]"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                {getTypeIcon(policy.type)}
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-[var(--ink-900)]">{policy.name}</h3>
                    {getStatusBadge(policy.status)}
                  </div>
                  <p className="text-sm text-[var(--ink-600)] mb-3">{policy.description}</p>

                  {/* Conditions */}
                  <div className="flex flex-wrap gap-2">
                    {policy.conditions.map((condition, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 text-xs bg-[var(--ink-50)] text-[var(--ink-600)] rounded-md"
                      >
                        {condition}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--ink-500)]">
                  Updated {formatDate(policy.lastUpdated)}
                </span>
                {policy.status !== "pending" && (
                  <button
                    onClick={() => onToggle(policy.id)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      policy.status === "active" ? "bg-[var(--ink-900)]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        policy.status === "active" ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                )}
                {policy.status === "pending" && (
                  <span className="text-xs text-[var(--signal-pending-ink)]">{t("dashboard.securityPage.policies.awaitingApproval")}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Policy Button */}
      <div className="flex justify-center">
        <button className="px-6 py-3 border-2 border-dashed border-[var(--ink-200)] rounded-xl text-[var(--ink-600)] hover:border-[var(--ink-900)] hover:text-[var(--ink-900)] transition-colors flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {t("dashboard.securityPage.policies.addCustom")}
        </button>
      </div>
    </div>
  );
}
