"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: "active" | "inactive" | "failing";
  secret: string;
  created_at: string;
  last_triggered?: string;
  success_count: number;
  failure_count: number;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: "success" | "failed" | "pending";
  response_code?: number;
  response_time_ms?: number;
  created_at: string;
  payload_preview?: string;
}

const EVENT_TYPE_IDS = [
  "memory.created",
  "memory.updated",
  "memory.deleted",
  "extraction.completed",
  "query.executed",
  "key.created",
  "key.revoked",
  "usage.threshold",
] as const;

// Mock data
const mockWebhooks: Webhook[] = [
  {
    id: "wh_1",
    name: "Slack Notifications",
    url: "https://hooks.slack.com/services/xxx/yyy/zzz",
    events: ["memory.created", "extraction.completed"],
    status: "active",
    secret: "whsec_xxxxx",
    created_at: "2024-01-15T10:00:00Z",
    last_triggered: "2024-01-20T15:30:00Z",
    success_count: 156,
    failure_count: 2,
  },
  {
    id: "wh_2",
    name: "Analytics Pipeline",
    url: "https://api.analytics.example.com/webhook",
    events: ["query.executed", "memory.created", "memory.deleted"],
    status: "active",
    secret: "whsec_yyyyy",
    created_at: "2024-01-10T08:00:00Z",
    last_triggered: "2024-01-20T14:45:00Z",
    success_count: 892,
    failure_count: 0,
  },
  {
    id: "wh_3",
    name: "Backup Service",
    url: "https://backup.example.com/ingest",
    events: ["memory.created", "memory.updated", "memory.deleted"],
    status: "failing",
    secret: "whsec_zzzzz",
    created_at: "2024-01-05T12:00:00Z",
    last_triggered: "2024-01-19T09:00:00Z",
    success_count: 45,
    failure_count: 12,
  },
];

const mockDeliveries: WebhookDelivery[] = [
  {
    id: "del_1",
    webhook_id: "wh_1",
    event: "memory.created",
    status: "success",
    response_code: 200,
    response_time_ms: 145,
    created_at: "2024-01-20T15:30:00Z",
    payload_preview: '{"type":"memory.created","data":{"id":"mem_xxx"...}',
  },
  {
    id: "del_2",
    webhook_id: "wh_2",
    event: "query.executed",
    status: "success",
    response_code: 200,
    response_time_ms: 89,
    created_at: "2024-01-20T14:45:00Z",
    payload_preview: '{"type":"query.executed","data":{"query":"..."...}',
  },
  {
    id: "del_3",
    webhook_id: "wh_3",
    event: "memory.created",
    status: "failed",
    response_code: 503,
    response_time_ms: 5000,
    created_at: "2024-01-19T09:00:00Z",
    payload_preview: '{"type":"memory.created","data":{"id":"mem_yyy"...}',
  },
];

export default function WebhooksClient() {
  const { t } = useDashboardTranslation();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [activeTab, setActiveTab] = useState<"webhooks" | "deliveries">("webhooks");

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      // In production, fetch from API
      // const [webhooksRes, deliveriesRes] = await Promise.all([
      //   fetch("/api/webhooks"),
      //   fetch("/api/webhooks/deliveries")
      // ]);
      setWebhooks(mockWebhooks);
      setDeliveries(mockDeliveries);
    } catch (err) {
      console.error("Failed to fetch webhooks:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveWebhook = async () => {
    if (!formName || !formUrl || formEvents.length === 0) return;

    if (editingWebhook) {
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === editingWebhook.id
            ? {
                ...w,
                name: formName,
                url: formUrl,
                events: formEvents,
              }
            : w
        )
      );
    } else {
    const newWebhook: Webhook = {
      id: `wh_${Date.now()}`,
      name: formName,
      url: formUrl,
      events: formEvents,
      status: "active",
      secret: `whsec_${Math.random().toString(36).substring(2, 15)}`,
      created_at: new Date().toISOString(),
      success_count: 0,
      failure_count: 0,
    };

      setWebhooks((prev) => [newWebhook, ...prev]);
    }
    setShowCreateModal(false);
    setEditingWebhook(null);
    setFormName("");
    setFormUrl("");
    setFormEvents([]);
  };

  const handleToggleWebhook = (webhook: Webhook) => {
    setWebhooks(webhooks.map(w =>
      w.id === webhook.id
        ? { ...w, status: w.status === "active" ? "inactive" : "active" }
        : w
    ));
  };

  const handleDeleteWebhook = (webhookId: string) => {
    if (confirm(t("dashboard.webhooks.deleteConfirm"))) {
      setWebhooks(webhooks.filter(w => w.id !== webhookId));
    }
  };

  const handleRetryDelivery = (deliveryId: string) => {
    // In production, call API to retry
    setDeliveries(deliveries.map(d =>
      d.id === deliveryId ? { ...d, status: "pending" as const } : d
    ));
  };

  // formatDate imported from @/lib/format-date (using "long" style for date+time)

  const eventTypes = EVENT_TYPE_IDS.map((id) => ({
    id,
    label: t(`dashboard.webhooks.events.${id.replace(".", "_")}.label`) || id,
    description: t(`dashboard.webhooks.events.${id.replace(".", "_")}.desc`) || "",
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "success":
        return "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-green-900/30 dark:text-green-400";
      case "inactive":
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      case "failing":
      case "failed":
        return "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] dark:bg-[var(--signal-conflict)]/30 dark:text-[var(--signal-conflict-soft)]";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--ink-900)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--ink-900)]">
            {t("dashboard.webhooks.title")}
          </h1>
          <p className="mt-1 text-[var(--ink-600)]">
            {t("dashboard.webhooks.subtitle")}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingWebhook(null);
            setFormName("");
            setFormUrl("");
            setFormEvents([]);
            setShowCreateModal(true);
          }}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:opacity-90 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("dashboard.webhooks.create")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--ink-600)]">{t("dashboard.webhooks.stats.total")}</p>
              <p className="text-lg font-semibold text-[var(--ink-900)]">{webhooks.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--signal-canon-soft)] dark:bg-green-900/30 rounded-lg">
              <svg className="w-5 h-5 text-[var(--signal-canon-ink)] dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--ink-600)]">{t("dashboard.webhooks.stats.active")}</p>
              <p className="text-lg font-semibold text-[var(--ink-900)]">
                {webhooks.filter(w => w.status === "active").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending)]/30 rounded-lg">
              <svg className="w-5 h-5 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--ink-600)]">{t("dashboard.webhooks.stats.failing")}</p>
              <p className="text-lg font-semibold text-[var(--ink-900)]">
                {webhooks.filter(w => w.status === "failing").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--ink-100)] dark:bg-[var(--ink-900)]/30 rounded-lg">
              <svg className="w-5 h-5 text-[var(--ink-900)] underline dark:text-[var(--ink-700)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--ink-600)]">{t("dashboard.webhooks.stats.deliveries")}</p>
              <p className="text-lg font-semibold text-[var(--ink-900)]">
                {webhooks.reduce((acc, w) => acc + w.success_count + w.failure_count, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--ink-200)]">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab("webhooks")}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "webhooks"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t("dashboard.webhooks.tabs.endpoints")}
          </button>
          <button
            onClick={() => setActiveTab("deliveries")}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "deliveries"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t("dashboard.webhooks.tabs.deliveries")}
          </button>
        </nav>
      </div>

      {/* Webhooks List */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          {webhooks.length === 0 ? (
            <div className="text-center py-12 bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)]">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-[var(--ink-900)]">
                {t("dashboard.webhooks.empty.title")}
              </h3>
              <p className="mt-2 text-[var(--ink-600)]">
                {t("dashboard.webhooks.empty.description")}
              </p>
              <button
                onClick={() => {
                  setEditingWebhook(null);
                  setFormName("");
                  setFormUrl("");
                  setFormEvents([]);
                  setShowCreateModal(true);
                }}
                className="mt-4 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:opacity-90 transition-colors"
              >
                {t("dashboard.webhooks.empty.cta")}
              </button>
            </div>
          ) : (
            webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-4 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-medium text-[var(--ink-900)]">
                        {webhook.name}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(webhook.status)}`}>
                        {webhook.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-600)] font-mono break-all">
                      {webhook.url}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {webhook.events.map((event) => (
                        <span
                          key={event}
                          className="px-2 py-1 text-xs bg-[var(--ink-50)] text-[var(--ink-600)] rounded"
                        >
                          {event}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-[var(--ink-600)] sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {webhook.success_count} {t("dashboard.webhooks.success")}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {webhook.failure_count} {t("dashboard.webhooks.failed")}
                      </span>
                      {webhook.last_triggered && (
                        <span className="col-span-2">
                          {t("dashboard.webhooks.lastTriggered")}: {formatDate(webhook.last_triggered, "long")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--ink-200)] pt-3 sm:border-0 sm:pt-0 sm:justify-end">
                    <button
                      onClick={() => handleToggleWebhook(webhook)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        webhook.status === "active" ? "bg-[var(--ink-900)]" : "bg-[var(--ink-50)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          webhook.status === "active" ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingWebhook(webhook);
                          setFormName(webhook.name);
                          setFormUrl(webhook.url);
                          setFormEvents(webhook.events);
                          setShowCreateModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title={t("dashboard.webhooks.edit")}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="p-2 text-gray-400 hover:text-[var(--signal-conflict-ink)] dark:hover:text-[var(--signal-conflict-soft)]"
                        title={t("dashboard.webhooks.delete")}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Deliveries List */}
      {activeTab === "deliveries" && (
        <div className="space-y-4">
          <div className="sm:hidden space-y-3">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink-900)]">{delivery.event}</span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                    {delivery.status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-[var(--ink-600)] space-y-1">
                  <div>{formatDate(delivery.created_at, "long")}</div>
                  <div>
                    {delivery.response_code && (
                      <span className={delivery.response_code < 400 ? "text-[var(--signal-canon-ink)]" : "text-[var(--signal-conflict-ink)]"}>
                        {delivery.response_code}
                      </span>
                    )}
                    {delivery.response_time_ms && <span className="ml-1">({delivery.response_time_ms}ms)</span>}
                  </div>
                </div>
                {delivery.status === "failed" && (
                  <button
                    onClick={() => handleRetryDelivery(delivery.id)}
                    className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {t("dashboard.webhooks.retry")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:block bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
            <thead className="bg-[var(--ink-50)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                  {t("dashboard.webhooks.table.event")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                  {t("dashboard.webhooks.table.status")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                  {t("dashboard.webhooks.table.response")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                  {t("dashboard.webhooks.table.time")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                  {t("dashboard.webhooks.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ink-200)]">
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-[var(--ink-900)]">
                      {delivery.event}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                      {delivery.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink-600)]">
                    {delivery.response_code && (
                      <span className={delivery.response_code < 400 ? "text-[var(--signal-canon-ink)]" : "text-[var(--signal-conflict-ink)]"}>
                        {delivery.response_code}
                      </span>
                    )}
                    {delivery.response_time_ms && (
                      <span className="ml-2">({delivery.response_time_ms}ms)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink-600)]">
                    {formatDate(delivery.created_at, "long")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {delivery.status === "failed" && (
                      <button
                        onClick={() => handleRetryDelivery(delivery.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        {t("dashboard.webhooks.retry")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--ink-0)] rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--ink-200)]">
              <h2 className="text-xl font-semibold text-[var(--ink-900)]">
                {t("dashboard.webhooks.modal.title")}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                  {t("dashboard.webhooks.modal.name")}
                </label>
                <input aria-label="Form Name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Webhook"
                  className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                  {t("dashboard.webhooks.modal.url")}
                </label>
                <input aria-label="Form Url"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink-600)] mb-2">
                  {t("dashboard.webhooks.modal.events")}
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {eventTypes.map((event) => (
                    <label
                      key={event.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--ink-50)] cursor-pointer"
                    >
                      <input aria-label="Event option"
                        type="checkbox"
                        checked={formEvents.includes(event.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormEvents([...formEvents, event.id]);
                          } else {
                            setFormEvents(formEvents.filter(ev => ev !== event.id));
                          }
                        }}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-[var(--ink-900)]">
                          {event.label}
                        </p>
                        <p className="text-xs text-[var(--ink-600)]">
                          {event.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--ink-200)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingWebhook(null);
                }}
                className="px-4 py-2 text-[var(--ink-600)] hover:bg-[var(--ink-50)] rounded-lg transition-colors"
              >
                {t("dashboard.webhooks.modal.cancel")}
              </button>
              <button
                onClick={handleSaveWebhook}
                disabled={!formName || !formUrl || formEvents.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("dashboard.webhooks.modal.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
