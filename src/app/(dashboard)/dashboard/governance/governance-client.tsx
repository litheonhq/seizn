"use client";

import { useState } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

type TabType = "retention" | "access" | "pii" | "compliance";

interface RetentionPolicy {
  id: string;
  namespace: string;
  memory_types: string[];
  ttl_days: number;
  auto_archive: boolean;
  created_at: string;
}

interface AccessRule {
  id: string;
  name: string;
  role: "admin" | "editor" | "viewer" | "api_only";
  namespaces: string[];
  permissions: string[];
  enabled: boolean;
}

interface PIIRule {
  id: string;
  pattern_name: string;
  pattern_type: "regex" | "ai_detection";
  action: "mask" | "redact" | "block" | "flag";
  enabled: boolean;
}

interface ComplianceSetting {
  id: string;
  framework: string;
  enabled: boolean;
  requirements_met: number;
  total_requirements: number;
}

// Mock data
const mockRetentionPolicies: RetentionPolicy[] = [
  {
    id: "1",
    namespace: "default",
    memory_types: ["fact", "preference", "instruction"],
    ttl_days: 365,
    auto_archive: true,
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "2",
    namespace: "session:*",
    memory_types: ["experience"],
    ttl_days: 30,
    auto_archive: false,
    created_at: "2024-02-01T10:00:00Z",
  },
  {
    id: "3",
    namespace: "temp:*",
    memory_types: ["*"],
    ttl_days: 7,
    auto_archive: false,
    created_at: "2024-03-01T10:00:00Z",
  },
];

const mockAccessRules: AccessRule[] = [
  {
    id: "1",
    name: "Admin Full Access",
    role: "admin",
    namespaces: ["*"],
    permissions: ["read", "write", "delete", "admin"],
    enabled: true,
  },
  {
    id: "2",
    name: "Editor Production",
    role: "editor",
    namespaces: ["prod:*"],
    permissions: ["read", "write"],
    enabled: true,
  },
  {
    id: "3",
    name: "Viewer Analytics",
    role: "viewer",
    namespaces: ["analytics:*"],
    permissions: ["read"],
    enabled: true,
  },
  {
    id: "4",
    name: "API Integration",
    role: "api_only",
    namespaces: ["integration:*"],
    permissions: ["read", "write"],
    enabled: false,
  },
];

const mockPIIRules: PIIRule[] = [
  {
    id: "1",
    pattern_name: "Email Address",
    pattern_type: "regex",
    action: "mask",
    enabled: true,
  },
  {
    id: "2",
    pattern_name: "Phone Number",
    pattern_type: "regex",
    action: "mask",
    enabled: true,
  },
  {
    id: "3",
    pattern_name: "Credit Card",
    pattern_type: "regex",
    action: "block",
    enabled: true,
  },
  {
    id: "4",
    pattern_name: "Social Security Number",
    pattern_type: "regex",
    action: "block",
    enabled: true,
  },
  {
    id: "5",
    pattern_name: "Personal Information (AI)",
    pattern_type: "ai_detection",
    action: "flag",
    enabled: false,
  },
];

const mockComplianceSettings: ComplianceSetting[] = [
  {
    id: "1",
    framework: "GDPR",
    enabled: true,
    requirements_met: 12,
    total_requirements: 12,
  },
  {
    id: "2",
    framework: "SOC 2 Type II",
    enabled: true,
    requirements_met: 8,
    total_requirements: 8,
  },
  {
    id: "3",
    framework: "HIPAA",
    enabled: false,
    requirements_met: 0,
    total_requirements: 15,
  },
  {
    id: "4",
    framework: "CCPA",
    enabled: true,
    requirements_met: 6,
    total_requirements: 6,
  },
];

export default function GovernanceClient() {
  const { t } = useDashboardTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("retention");
  const [retentionPolicies, setRetentionPolicies] = useState(mockRetentionPolicies);
  const [accessRules, setAccessRules] = useState(mockAccessRules);
  const [piiRules, setPIIRules] = useState(mockPIIRules);
  const [complianceSettings] = useState(mockComplianceSettings);

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "retention", label: t("governance.tabs.retention") || "Data Retention", icon: "🗄️" },
    { id: "access", label: t("governance.tabs.access") || "Access Control", icon: "🔐" },
    { id: "pii", label: t("governance.tabs.pii") || "PII Detection", icon: "🛡️" },
    { id: "compliance", label: t("governance.tabs.compliance") || "Compliance", icon: "✅" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("governance.title") || "Governance"}
        </h1>
        <p className="text-gray-500 mt-1">
          {t("governance.subtitle") || "Manage data policies, retention rules, and compliance settings"}
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🗄️</span>
            <span className="text-sm text-gray-500">{t("governance.stats.retentionPolicies") || "Retention Policies"}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{retentionPolicies.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔐</span>
            <span className="text-sm text-gray-500">{t("governance.stats.accessRules") || "Access Rules"}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{accessRules.filter(r => r.enabled).length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🛡️</span>
            <span className="text-sm text-gray-500">{t("governance.stats.piiRules") || "PII Rules Active"}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{piiRules.filter(r => r.enabled).length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="text-sm text-gray-500">{t("governance.stats.complianceScore") || "Compliance Score"}</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">100%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "retention" && (
        <RetentionPoliciesTab
          policies={retentionPolicies}
          onUpdate={setRetentionPolicies}
        />
      )}
      {activeTab === "access" && (
        <AccessControlTab
          rules={accessRules}
          onUpdate={setAccessRules}
        />
      )}
      {activeTab === "pii" && (
        <PIIDetectionTab
          rules={piiRules}
          onUpdate={setPIIRules}
        />
      )}
      {activeTab === "compliance" && (
        <ComplianceTab settings={complianceSettings} />
      )}
    </div>
  );
}

function RetentionPoliciesTab({
  policies,
  onUpdate,
}: {
  policies: RetentionPolicy[];
  onUpdate: (policies: RetentionPolicy[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this retention policy?")) {
      onUpdate(policies.filter((p) => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Configure how long memories are retained in each namespace
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
        >
          Add Policy
        </button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Namespace</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Memory Types</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">TTL</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Auto Archive</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {policies.map((policy) => (
              <tr key={policy.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <code className="px-2 py-1 bg-gray-100 rounded text-sm">{policy.namespace}</code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {policy.memory_types.map((type) => (
                      <span key={type} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {type}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-900">{policy.ttl_days} days</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    policy.auto_archive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {policy.auto_archive ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(policy.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <AddRetentionPolicyModal
          onClose={() => setShowModal(false)}
          onAdd={(policy) => {
            onUpdate([...policies, { ...policy, id: Date.now().toString(), created_at: new Date().toISOString() }]);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddRetentionPolicyModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (policy: Omit<RetentionPolicy, "id" | "created_at">) => void;
}) {
  const [namespace, setNamespace] = useState("");
  const [memoryTypes, setMemoryTypes] = useState<string[]>(["fact"]);
  const [ttlDays, setTtlDays] = useState(30);
  const [autoArchive, setAutoArchive] = useState(false);

  const allTypes = ["fact", "preference", "instruction", "relationship", "experience"];

  const toggleType = (type: string) => {
    setMemoryTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add Retention Policy</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namespace Pattern</label>
            <input
              type="text"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="prod:*, session:*, default"
              className="w-full px-3 py-2 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Use * for wildcard matching</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Memory Types</label>
            <div className="flex flex-wrap gap-2">
              {allTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`px-3 py-1.5 text-sm rounded-full border ${
                    memoryTypes.includes(type)
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTL (Days)</label>
            <input
              type="number"
              value={ttlDays}
              onChange={(e) => setTtlDays(parseInt(e.target.value))}
              min={1}
              max={3650}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Auto Archive</p>
              <p className="text-sm text-gray-500">Archive before deletion</p>
            </div>
            <button
              onClick={() => setAutoArchive(!autoArchive)}
              className={`w-12 h-6 rounded-full transition-colors ${
                autoArchive ? "bg-emerald-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  autoArchive ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onAdd({ namespace, memory_types: memoryTypes, ttl_days: ttlDays, auto_archive: autoArchive })}
            disabled={!namespace || memoryTypes.length === 0}
            className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            Add Policy
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessControlTab({
  rules,
  onUpdate,
}: {
  rules: AccessRule[];
  onUpdate: (rules: AccessRule[]) => void;
}) {
  const toggleRule = (id: string) => {
    onUpdate(
      rules.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-700";
      case "editor":
        return "bg-blue-100 text-blue-700";
      case "viewer":
        return "bg-gray-100 text-gray-700";
      case "api_only":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Define role-based access controls for your team
        </p>
        <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
          Add Rule
        </button>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleColor(rule.role)}`}>
                    {rule.role}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Namespaces:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rule.namespaces.map((ns) => (
                        <code key={ns} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {ns}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Permissions:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rule.permissions.map((perm) => (
                        <span key={perm} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleRule(rule.id)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  rule.enabled ? "bg-emerald-500" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    rule.enabled ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PIIDetectionTab({
  rules,
  onUpdate,
}: {
  rules: PIIRule[];
  onUpdate: (rules: PIIRule[]) => void;
}) {
  const toggleRule = (id: string) => {
    onUpdate(
      rules.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "block":
        return "bg-red-100 text-red-700";
      case "redact":
        return "bg-orange-100 text-orange-700";
      case "mask":
        return "bg-yellow-100 text-yellow-700";
      case "flag":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Automatically detect and handle personally identifiable information
        </p>
        <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
          Add Rule
        </button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Pattern</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{rule.pattern_name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    rule.pattern_type === "ai_detection"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {rule.pattern_type === "ai_detection" ? "AI Detection" : "Regex"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getActionColor(rule.action)}`}>
                    {rule.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      rule.enabled ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        rule.enabled ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="font-medium text-amber-800">AI Detection is in Beta</h4>
            <p className="text-sm text-amber-700 mt-1">
              AI-powered PII detection may have false positives. Review flagged content before taking action.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplianceTab({ settings }: { settings: ComplianceSetting[] }) {
  const getComplianceIcon = (framework: string) => {
    switch (framework) {
      case "GDPR":
        return "🇪🇺";
      case "SOC 2 Type II":
        return "🛡️";
      case "HIPAA":
        return "🏥";
      case "CCPA":
        return "🇺🇸";
      default:
        return "📋";
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Track compliance with major regulatory frameworks
      </p>

      <div className="grid grid-cols-2 gap-4">
        {settings.map((setting) => (
          <div
            key={setting.id}
            className={`bg-white rounded-xl border p-6 ${
              !setting.enabled ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getComplianceIcon(setting.framework)}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{setting.framework}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    setting.enabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {setting.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {setting.enabled && (
              <>
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Requirements Met</span>
                    <span className="font-medium text-gray-900">
                      {setting.requirements_met}/{setting.total_requirements}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${(setting.requirements_met / setting.total_requirements) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {setting.requirements_met === setting.total_requirements && (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm">
                    <span>✓</span>
                    <span>Fully Compliant</span>
                  </div>
                )}
              </>
            )}

            {!setting.enabled && (
              <button className="w-full mt-4 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Enable Compliance Check
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Compliance Reports</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span>📄</span>
              <div>
                <p className="font-medium text-gray-900">SOC 2 Type II Report</p>
                <p className="text-sm text-gray-500">Generated Dec 2024</p>
              </div>
            </div>
            <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white">
              Download
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span>📄</span>
              <div>
                <p className="font-medium text-gray-900">Data Processing Agreement</p>
                <p className="text-sm text-gray-500">GDPR compliant DPA template</p>
              </div>
            </div>
            <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white">
              Download
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span>📄</span>
              <div>
                <p className="font-medium text-gray-900">Security Questionnaire</p>
                <p className="text-sm text-gray-500">Pre-filled security assessment</p>
              </div>
            </div>
            <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white">
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
