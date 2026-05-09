"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";
import { DATA_RETENTION, formatDays, formatYears } from "@/lib/policy";

type TabType = "requests" | "subjects" | "certificates" | "settings";
type RTBFStatus = "pending" | "in_progress" | "completed" | "rejected" | "expired";
type RTBFPhase = "discovery" | "verification" | "deletion" | "completed" | "verified";

const rtbfResponseWindow = formatDays(DATA_RETENTION.ACCOUNT_DELETION_DAYS);
const rtbfComplexExtensionWindow = formatDays(DATA_RETENTION.RTBF_COMPLEX_EXTENSION_DAYS);
const auditLogRetentionWindow = formatYears(DATA_RETENTION.TAX_RECORD_YEARS);

interface RTBFRequest {
  id: string;
  subject_id: string;
  subject_email: string;
  status: RTBFStatus;
  phase: RTBFPhase;
  requested_at: string;
  due_date: string;
  completed_at: string | null;
  verified_at: string | null;
  deletion_scope: string[];
  data_categories: string[];
}

interface DataSubject {
  id: string;
  email: string;
  external_id: string | null;
  request_count: number;
  last_request: string | null;
  data_categories: string[];
}

interface DeletionCertificate {
  id: string;
  request_id: string;
  subject_email: string;
  issued_at: string;
  hash: string;
  gdpr_compliant: boolean;
}

interface ComplianceSettings {
  auto_discovery: boolean;
  verification_required: boolean;
  response_deadline_days: number;
  notification_email: string;
  audit_retention_days: number;
}

// Mock data
const mockRequests: RTBFRequest[] = [
  {
    id: "rtbf-001",
    subject_id: "subj-001",
    subject_email: "user@example.com",
    status: "completed",
    phase: "verified",
    requested_at: "2026-01-15T10:00:00Z",
    due_date: "2026-02-14T10:00:00Z",
    completed_at: "2026-01-20T14:30:00Z",
    verified_at: "2026-01-20T15:00:00Z",
    deletion_scope: ["memories", "traces", "analytics"],
    data_categories: ["personal", "behavioral", "preferences"],
  },
  {
    id: "rtbf-002",
    subject_id: "subj-002",
    subject_email: "john.doe@company.com",
    status: "in_progress",
    phase: "deletion",
    requested_at: "2026-01-28T09:00:00Z",
    due_date: "2026-02-27T09:00:00Z",
    completed_at: null,
    verified_at: null,
    deletion_scope: ["memories", "traces"],
    data_categories: ["personal", "behavioral"],
  },
  {
    id: "rtbf-003",
    subject_id: "subj-003",
    subject_email: "jane.smith@org.io",
    status: "pending",
    phase: "discovery",
    requested_at: "2026-02-01T11:00:00Z",
    due_date: "2026-03-03T11:00:00Z",
    completed_at: null,
    verified_at: null,
    deletion_scope: ["memories"],
    data_categories: ["personal"],
  },
];

const mockSubjects: DataSubject[] = [
  {
    id: "subj-001",
    email: "user@example.com",
    external_id: "ext-12345",
    request_count: 1,
    last_request: "2026-01-15T10:00:00Z",
    data_categories: ["personal", "behavioral", "preferences"],
  },
  {
    id: "subj-002",
    email: "john.doe@company.com",
    external_id: null,
    request_count: 2,
    last_request: "2026-01-28T09:00:00Z",
    data_categories: ["personal", "behavioral"],
  },
  {
    id: "subj-003",
    email: "jane.smith@org.io",
    external_id: "ext-67890",
    request_count: 1,
    last_request: "2026-02-01T11:00:00Z",
    data_categories: ["personal"],
  },
];

const mockCertificates: DeletionCertificate[] = [
  {
    id: "cert-001",
    request_id: "rtbf-001",
    subject_email: "user@example.com",
    issued_at: "2026-01-20T15:00:00Z",
    hash: "sha256:e3b0c44298fc1c149afbf4c8996fb924",
    gdpr_compliant: true,
  },
];

const defaultSettings: ComplianceSettings = {
  auto_discovery: true,
  verification_required: true,
  response_deadline_days: DATA_RETENTION.ACCOUNT_DELETION_DAYS,
  notification_email: "privacy@company.com",
  audit_retention_days: DATA_RETENTION.TAX_RECORD_YEARS * 365,
};

export default function PrivacyClient() {
  const { t } = useDashboardTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("requests");
  const [requests, setRequests] = useState<RTBFRequest[]>([]);
  const [subjects, setSubjects] = useState<DataSubject[]>([]);
  const [certificates, setCertificates] = useState<DeletionCertificate[]>([]);
  const [settings, setSettings] = useState<ComplianceSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // In production, these would be API calls
      // const [reqRes, subjRes, certRes] = await Promise.all([
      //   fetch('/api/winter/rtbf'),
      //   fetch('/api/winter/data-subjects'),
      //   fetch('/api/winter/certificates'),
      // ]);

      // Mock data for now
      setRequests(mockRequests);
      setSubjects(mockSubjects);
      setCertificates(mockCertificates);
    } catch (error) {
      console.error("Failed to load RTBF data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "requests", label: t("dashboard.privacy.tabs.requests") || "RTBF Requests", icon: "📋" },
    { id: "subjects", label: t("dashboard.privacy.tabs.subjects") || "Data Subjects", icon: "👤" },
    { id: "certificates", label: t("dashboard.privacy.tabs.certificates") || "Certificates", icon: "📜" },
    { id: "settings", label: t("dashboard.privacy.tabs.settings") || "Settings", icon: "⚙️" },
  ];

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const inProgressCount = requests.filter(r => r.status === "in_progress").length;
  const completedCount = requests.filter(r => r.status === "completed").length;
  const overdueCount = requests.filter(r =>
    r.status !== "completed" && new Date(r.due_date) < new Date()
  ).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">
          {t("dashboard.privacy.title") || "Privacy & RTBF"}
        </h1>
        <p className="text-[var(--ink-600)] mt-1">
          {t("dashboard.privacy.subtitle") || "Manage GDPR Right to be Forgotten requests and data subject rights"}
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⏳</span>
            <span className="text-sm text-[var(--ink-600)]">
              {t("dashboard.privacy.stats.pending") || "Pending"}
            </span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">{pendingCount}</p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔄</span>
            <span className="text-sm text-[var(--ink-600)]">
              {t("dashboard.privacy.stats.inProgress") || "In Progress"}
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="text-sm text-[var(--ink-600)]">
              {t("dashboard.privacy.stats.completed") || "Completed"}
            </span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">{completedCount}</p>
        </div>
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm text-[var(--ink-600)]">
              {t("dashboard.privacy.stats.overdue") || "Overdue"}
            </span>
          </div>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-[var(--signal-conflict-ink)]" : "text-[var(--ink-900)]"}`}>
            {overdueCount}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--ink-50)] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--ink-900)]" />
        </div>
      ) : (
        <>
          {activeTab === "requests" && (
            <RTBFRequestsTab requests={requests} onRefresh={loadData} />
          )}
          {activeTab === "subjects" && (
            <DataSubjectsTab subjects={subjects} />
          )}
          {activeTab === "certificates" && (
            <CertificatesTab certificates={certificates} />
          )}
          {activeTab === "settings" && (
            <SettingsTab settings={settings} onUpdate={setSettings} />
          )}
        </>
      )}
    </div>
  );
}

function RTBFRequestsTab({
  requests,
  onRefresh,
}: {
  requests: RTBFRequest[];
  onRefresh: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RTBFRequest | null>(null);

  const getStatusColor = (status: RTBFStatus) => {
    switch (status) {
      case "pending":
        return "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)]";
      case "in_progress":
        return "bg-blue-100 text-blue-700";
      case "completed":
        return "bg-[var(--signal-canon)]/10 text-[var(--signal-canon)]";
      case "rejected":
        return "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]";
      case "expired":
        return "bg-[var(--ink-50)] text-[var(--ink-900)]";
      default:
        return "bg-[var(--ink-50)] text-[var(--ink-900)]";
    }
  };

  const getPhaseIcon = (phase: RTBFPhase) => {
    switch (phase) {
      case "discovery":
        return "🔍";
      case "verification":
        return "✓";
      case "deletion":
        return "🗑️";
      case "completed":
        return "✅";
      case "verified":
        return "🔒";
      default:
        return "📋";
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleVerify = async (requestId: string) => {
    try {
      const response = await fetch(`/api/winter/rtbf/${requestId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxRetries: 3 }),
      });

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error("Verification failed:", error);
    }
  };

  const handleDownloadCertificate = async (requestId: string) => {
    try {
      const response = await fetch(`/api/winter/rtbf/${requestId}/certificate`);
      const data = await response.json();

      // Download as JSON for now
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deletion-certificate-${requestId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Certificate download failed:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--ink-600)]">
          Manage Right to be Forgotten requests under GDPR Article 17
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
        >
          New Request
        </button>
      </div>

      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Subject</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Phase</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Due Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Scope</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ink-200)]">
            {requests.map((request) => {
              const daysRemaining = getDaysRemaining(request.due_date);
              const isOverdue = daysRemaining < 0 && request.status !== "completed";

              return (
                <tr key={request.id} className="hover:bg-[var(--ink-50)]">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[var(--ink-900)]">{request.subject_email}</p>
                      <p className="text-xs text-[var(--ink-600)]">{request.id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{getPhaseIcon(request.phase)}</span>
                      <span className="text-sm text-[var(--ink-900)]">{request.phase}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className={`text-sm ${isOverdue ? "text-[var(--signal-conflict-ink)] font-medium" : "text-[var(--ink-900)]"}`}>
                        {formatDate(request.due_date)}
                      </p>
                      {request.status !== "completed" && (
                        <p className={`text-xs ${isOverdue ? "text-[var(--signal-conflict-ink)]" : "text-[var(--ink-600)]"}`}>
                          {isOverdue ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days left`}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {request.deletion_scope.map((scope) => (
                        <span key={scope} className="px-2 py-0.5 bg-[var(--ink-50)] text-[var(--ink-900)] text-xs rounded-full">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </button>
                      {request.status === "completed" && request.phase === "verified" && (
                        <button
                          onClick={() => handleDownloadCertificate(request.id)}
                          className="text-[var(--ink-900)] hover:text-[var(--ink-900)] text-sm"
                        >
                          Certificate
                        </button>
                      )}
                      {request.status === "completed" && request.phase !== "verified" && (
                        <button
                          onClick={() => handleVerify(request.id)}
                          className="text-[var(--signal-pending-ink)] hover:text-[var(--signal-pending-ink)] text-sm"
                        >
                          Verify
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Request Details Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onVerify={handleVerify}
          onDownloadCertificate={handleDownloadCertificate}
        />
      )}

      {/* New Request Modal */}
      {showModal && (
        <NewRequestModal
          onClose={() => setShowModal(false)}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}

function RequestDetailModal({
  request,
  onClose,
  onVerify,
  onDownloadCertificate,
}: {
  request: RTBFRequest;
  onClose: () => void;
  onVerify: (id: string) => void;
  onDownloadCertificate: (id: string) => void;
}) {
  const phases: RTBFPhase[] = ["discovery", "verification", "deletion", "completed", "verified"];
  const currentPhaseIndex = phases.indexOf(request.phase);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--ink-0)] rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--ink-900)]">RTBF Request Details</h2>
            <p className="text-sm text-[var(--ink-600)] mt-1">{request.id}</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-500)] hover:text-[var(--ink-600)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            {phases.map((phase, index) => (
              <div
                key={phase}
                className={`flex flex-col items-center ${
                  index <= currentPhaseIndex ? "text-[var(--ink-900)]" : "text-[var(--ink-500)]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    index <= currentPhaseIndex ? "bg-[var(--ink-900)]/10" : "bg-gray-100"
                  }`}
                >
                  {index < currentPhaseIndex ? "✓" : index + 1}
                </div>
                <span className="text-xs mt-1 capitalize">{phase}</span>
              </div>
            ))}
          </div>
          <div className="h-2 bg-gray-100 rounded-full">
            <div
              className="h-full bg-[var(--ink-900)] rounded-full transition-all"
              style={{ width: `${((currentPhaseIndex + 1) / phases.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[var(--ink-50)] rounded-lg p-4">
            <p className="text-sm text-[var(--ink-600)]">Data Subject</p>
            <p className="font-medium text-[var(--ink-900)]">{request.subject_email}</p>
          </div>
          <div className="bg-[var(--ink-50)] rounded-lg p-4">
            <p className="text-sm text-[var(--ink-600)]">Requested At</p>
            <p className="font-medium text-[var(--ink-900)]">
              {new Date(request.requested_at).toLocaleString()}
            </p>
          </div>
          <div className="bg-[var(--ink-50)] rounded-lg p-4">
            <p className="text-sm text-[var(--ink-600)]">Due Date</p>
            <p className="font-medium text-[var(--ink-900)]">
              {new Date(request.due_date).toLocaleString()}
            </p>
          </div>
          <div className="bg-[var(--ink-50)] rounded-lg p-4">
            <p className="text-sm text-[var(--ink-600)]">Status</p>
            <p className="font-medium text-[var(--ink-900)] capitalize">{request.status}</p>
          </div>
        </div>

        {/* Data Categories */}
        <div className="mb-6">
          <h3 className="font-medium text-[var(--ink-900)] mb-2">Data Categories</h3>
          <div className="flex flex-wrap gap-2">
            {request.data_categories.map((cat) => (
              <span key={cat} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Deletion Scope */}
        <div className="mb-6">
          <h3 className="font-medium text-[var(--ink-900)] mb-2">Deletion Scope</h3>
          <div className="flex flex-wrap gap-2">
            {request.deletion_scope.map((scope) => (
              <span key={scope} className="px-3 py-1 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-full text-sm">
                {scope}
              </span>
            ))}
          </div>
        </div>

        {/* Timestamps */}
        {(request.completed_at || request.verified_at) && (
          <div className="mb-6 p-4 bg-[var(--ink-900)]/5 rounded-lg">
            <h3 className="font-medium text-[var(--ink-900)] mb-2">Completion Details</h3>
            {request.completed_at && (
              <p className="text-sm text-[var(--signal-canon)]">
                Completed: {new Date(request.completed_at).toLocaleString()}
              </p>
            )}
            {request.verified_at && (
              <p className="text-sm text-[var(--signal-canon)]">
                Verified: {new Date(request.verified_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-[var(--ink-50)]">
            Close
          </button>
          {request.status === "completed" && request.phase !== "verified" && (
            <button
              onClick={() => {
                onVerify(request.id);
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-[var(--signal-pending)] text-white rounded-lg hover:bg-[var(--signal-pending)]"
            >
              Run Verification
            </button>
          )}
          {request.phase === "verified" && (
            <button
              onClick={() => {
                onDownloadCertificate(request.id);
              }}
              className="flex-1 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
            >
              Download Certificate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<string[]>(["memories"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allScopes = ["memories", "traces", "analytics", "embeddings", "logs"];

  const toggleScope = (s: string) => {
    setScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleSubmit = async () => {
    if (!email || scope.length === 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/winter/rtbf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_email: email,
          deletion_scope: scope,
        }),
      });

      if (response.ok) {
        onCreated();
        onClose();
      }
    } catch (error) {
      console.error("Failed to create request:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--ink-0)] rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-[var(--ink-900)] mb-4">New RTBF Request</h2>
        <p className="text-sm text-[var(--ink-600)] mb-6">
          Create a new Right to be Forgotten request. The deadline will be set to {rtbfResponseWindow} from now per GDPR requirements.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
              Data Subject Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--ink-900)] mb-2">
              Deletion Scope
            </label>
            <div className="flex flex-wrap gap-2">
              {allScopes.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleScope(s)}
                  className={`px-3 py-1.5 text-sm rounded-full border ${
                    scope.includes(s)
                      ? "bg-[var(--ink-900)] text-white border-[var(--ink-900)]"
                      : "border-[var(--ink-200)] text-[var(--ink-600)] hover:border-[var(--ink-200)]/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-[var(--ink-50)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!email || scope.length === 0 || isSubmitting}
            className="flex-1 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataSubjectsTab({ subjects }: { subjects: DataSubject[] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ink-600)]">
        View and manage data subjects who have interacted with your system
      </p>

      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">External ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Requests</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Data Categories</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ink-200)]">
            {subjects.map((subject) => (
              <tr key={subject.id} className="hover:bg-[var(--ink-50)]">
                <td className="px-4 py-3">
                  <span className="font-medium text-[var(--ink-900)]">{subject.email}</span>
                </td>
                <td className="px-4 py-3">
                  {subject.external_id ? (
                    <code className="px-2 py-0.5 bg-gray-100 rounded text-sm">{subject.external_id}</code>
                  ) : (
                    <span className="text-[var(--ink-500)]">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-[var(--ink-900)]">{subject.request_count}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {subject.data_categories.map((cat) => (
                      <span key={cat} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {cat}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-600 hover:text-blue-800 text-sm">
                    View Data
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CertificatesTab({ certificates }: { certificates: DeletionCertificate[] }) {
  const handleDownload = (cert: DeletionCertificate) => {
    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deletion-certificate-${cert.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ink-600)]">
        Cryptographic proof of data deletion for compliance audits
      </p>

      {certificates.length === 0 ? (
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-12 text-center">
          <span className="text-4xl mb-4 block">📜</span>
          <h3 className="font-medium text-[var(--ink-900)] mb-2">No Certificates Yet</h3>
          <p className="text-[var(--ink-600)] text-sm">
            Certificates are generated when RTBF requests are verified
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <div key={cert.id} className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-[var(--ink-900)]/10 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📜</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--ink-900)]">{cert.subject_email}</h3>
                    <p className="text-sm text-[var(--ink-600)]">Request: {cert.request_id}</p>
                    <p className="text-xs text-[var(--ink-500)] mt-1">
                      Issued: {new Date(cert.issued_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {cert.gdpr_compliant && (
                    <span className="px-2 py-1 bg-[var(--signal-canon)]/10 text-[var(--signal-canon)] text-xs rounded-full">
                      GDPR Compliant
                    </span>
                  )}
                  <button
                    onClick={() => handleDownload(cert)}
                    className="px-3 py-1.5 text-sm border rounded-lg hover:bg-[var(--ink-50)]"
                  >
                    Download
                  </button>
                </div>
              </div>
              <div className="mt-4 p-3 bg-[var(--ink-50)] rounded-lg">
                <p className="text-xs text-[var(--ink-600)] mb-1">Certificate Hash</p>
                <code className="text-sm text-[var(--ink-900)] break-all">{cert.hash}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab({
  settings,
  onUpdate,
}: {
  settings: ComplianceSettings;
  onUpdate: (settings: ComplianceSettings) => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // In production, this would be an API call
      // await fetch('/api/winter/settings', { method: 'PUT', body: JSON.stringify(localSettings) });
      onUpdate(localSettings);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ink-600)]">
        Configure RTBF processing and compliance settings
      </p>

      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6 space-y-6">
        {/* Auto Discovery */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-[var(--ink-900)]">Auto Discovery</h3>
            <p className="text-sm text-[var(--ink-600)]">
              Automatically discover all data associated with a subject
            </p>
          </div>
          <button
            onClick={() => setLocalSettings({ ...localSettings, auto_discovery: !localSettings.auto_discovery })}
            className={`w-12 h-6 rounded-full transition-colors ${
              localSettings.auto_discovery ? "bg-[var(--ink-900)]" : "bg-gray-200"
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                localSettings.auto_discovery ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Verification Required */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-[var(--ink-900)]">Verification Required</h3>
            <p className="text-sm text-[var(--ink-600)]">
              Require verification before issuing deletion certificates
            </p>
          </div>
          <button
            onClick={() => setLocalSettings({ ...localSettings, verification_required: !localSettings.verification_required })}
            className={`w-12 h-6 rounded-full transition-colors ${
              localSettings.verification_required ? "bg-[var(--ink-900)]" : "bg-gray-200"
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                localSettings.verification_required ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Response Deadline */}
        <div>
          <label className="block font-medium text-[var(--ink-900)] mb-1">
            Response Deadline (Days)
          </label>
          <p className="text-sm text-[var(--ink-600)] mb-2">
            GDPR requires response within {rtbfResponseWindow} (extendable to {rtbfComplexExtensionWindow} for complex requests)
          </p>
          <input
            type="number"
            value={localSettings.response_deadline_days}
            onChange={(e) => setLocalSettings({ ...localSettings, response_deadline_days: parseInt(e.target.value) })}
            min={1}
            max={90}
            className="w-32 px-3 py-2 border rounded-lg"
          />
        </div>

        {/* Notification Email */}
        <div>
          <label className="block font-medium text-[var(--ink-900)] mb-1">
            Notification Email
          </label>
          <p className="text-sm text-[var(--ink-600)] mb-2">
            Email address for RTBF request notifications
          </p>
          <input
            type="email"
            value={localSettings.notification_email}
            onChange={(e) => setLocalSettings({ ...localSettings, notification_email: e.target.value })}
            className="w-full max-w-md px-3 py-2 border rounded-lg"
          />
        </div>

        {/* Audit Retention */}
        <div>
          <label className="block font-medium text-[var(--ink-900)] mb-1">
            Audit Log Retention (Days)
          </label>
          <p className="text-sm text-[var(--ink-600)] mb-2">
            How long to retain audit logs for compliance purposes
          </p>
          <input
            type="number"
            value={localSettings.audit_retention_days}
            onChange={(e) => setLocalSettings({ ...localSettings, audit_retention_days: parseInt(e.target.value) })}
            min={365}
            max={3650}
            className="w-32 px-3 py-2 border rounded-lg"
          />
          <span className="text-sm text-[var(--ink-600)] ml-2">
            (~{Math.round(localSettings.audit_retention_days / 365)} years)
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Compliance Information */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h4 className="font-medium text-blue-800">GDPR Compliance Notes</h4>
            <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
              <li>RTBF requests must be fulfilled within {rtbfResponseWindow} (Article 17)</li>
              <li>Complex requests may be extended to {rtbfComplexExtensionWindow} with notification</li>
              <li>Audit logs should be retained for {auditLogRetentionWindow} for legal compliance</li>
              <li>Deletion certificates provide cryptographic proof of erasure</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
