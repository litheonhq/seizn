"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { useToast } from "@/contexts/ToastContext";
import { ttfsEvents } from "@/lib/analytics";
import { markOnboardingStepComplete } from "@/lib/onboarding/progress";
import { getErrorMessage } from "@/lib/ui-error";
import type { ApiKey } from "@/types/dashboard";
import { formatDate } from "@/lib/format-date";

export default function ApiKeysClient() {
  const { t } = useDashboardTranslation();
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<{ id: string; name: string } | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const buildExampleRequest = useCallback(
    (apiKey: string) => `curl -X POST \\
  https://seizn.com/api/memories \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Remember that I prefer concise onboarding flows.","memory_type":"preference"}'`,
    []
  );

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/keys");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(getErrorMessage(data?.error, "Failed to fetch API keys"));
      }

      setApiKeys(data.keys);
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err, "Failed to fetch API keys");
      setError(message);
      toast("error", message);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (data.success) {
        setNewKey(data.key);
        setApiKeys((previousKeys) => [data.keyRecord, ...previousKeys]);
        markOnboardingStepComplete("api_key");
        ttfsEvents.apiKeyCreated(data.keyRecord?.name || newKeyName);
        setNewKeyName("");
        setError(null);
      } else {
        setError(getErrorMessage(data.error, "Failed to create key"));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create key"));
    } finally {
      setIsCreating(false);
    }
  };

  const confirmRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);

    try {
      const res = await fetch(`/api/dashboard/keys?id=${revokeTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setApiKeys((previousKeys) =>
          previousKeys.filter((key) => key.id !== revokeTarget.id)
        );
      }
    } catch {
      toast("error", "Failed to revoke API key");
    } finally {
      setIsRevoking(false);
      setRevokeTarget(null);
    }
  }, [revokeTarget, toast]);

  const confirmRotate = useCallback(async () => {
    if (!rotateTarget) return;
    setIsRotating(true);

    try {
      const res = await fetch(`/api/dashboard/keys/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: rotateTarget.id }),
      });
      const data = await res.json();

      if (data.success) {
        setRotatedKey(data.key);
        // Update the key in the list
        setApiKeys((previousKeys) =>
          previousKeys.map((key) =>
            key.id === rotateTarget.id
              ? { ...key, key_prefix: data.keyPrefix, created_at: new Date().toISOString() }
              : key
          )
        );
      }
    } catch {
      toast("error", "Failed to rotate API key");
    } finally {
      setIsRotating(false);
    }
  }, [rotateTarget, toast]);

  const closeRotateModal = () => {
    setRotateTarget(null);
    setRotatedKey(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewKeyName("");
    setNewKey(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)]">{t("dashboard.keysPage.title")}</h1>
          <p className="text-[var(--ink-600)] mt-1">
            {t("dashboard.keysPage.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="theme-gradient-btn text-white px-5 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          {t("dashboard.keysPage.createNewKey")}
        </button>
      </div>

      {/* API Keys List */}
      <div className="szn-card rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--ink-200)]">
          <h2 className="font-semibold text-[var(--ink-900)]">{t("dashboard.keysPage.activeKeys")}</h2>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-4 bg-[var(--ink-50)] rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[var(--ink-50)] rounded-lg" />
                  <div>
                    <div className="h-4 bg-[var(--ink-50)] rounded w-24 mb-2" />
                    <div className="h-3 bg-[var(--ink-50)] rounded w-32" />
                  </div>
                </div>
                <div className="h-8 bg-[var(--ink-50)] rounded w-20" />
              </div>
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--ink-50)] flex items-center justify-center">
              <KeyIcon className="w-8 h-8 text-[var(--ink-500)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
              {t("dashboard.keysPage.noKeysTitle")}
            </h3>
            <p className="text-[var(--ink-600)] mb-6 max-w-sm mx-auto">
              {t("dashboard.keysPage.noKeysDesc")}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="theme-gradient-btn text-white px-6 py-2.5 rounded-xl font-medium"
            >
              {t("dashboard.keysPage.createApiKey")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--ink-200)] text-left">
                  <th className="px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">{t("dashboard.keysPage.name")}</th>
                  <th className="px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider hidden sm:table-cell">{t("dashboard.keysPage.keyColumn")}</th>
                  <th className="px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider hidden md:table-cell">{t("dashboard.keysPage.created")}</th>
                  <th className="px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider hidden lg:table-cell">{t("dashboard.keysPage.lastUsed")}</th>
                  <th className="px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider text-right">{t("dashboard.keysPage.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink-200)]">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-[var(--ink-50)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                          <KeyIcon className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-[var(--ink-900)]">{key.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <code className="text-sm text-[var(--ink-600)] bg-[var(--ink-50)] px-2 py-0.5 rounded">{key.key_prefix}...</code>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-[var(--ink-900)]">{formatDate(key.created_at)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {key.last_used_at ? (
                        <span className="text-sm text-[var(--ink-900)]">{formatDate(key.last_used_at)}</span>
                      ) : (
                        <span className="text-sm text-[var(--ink-500)]">{t("dashboard.keysPage.neverUsed")}</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                        <button
                          onClick={() => setRotateTarget({ id: key.id, name: key.name })}
                          className="p-2.5 min-w-[44px] min-h-[44px] sm:p-2 sm:min-w-0 sm:min-h-0 flex items-center justify-center text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-900)]/10 active:bg-[var(--ink-900)]/20 rounded-lg transition-colors"
                          title={t("dashboard.keysPage.rotate")}
                        >
                          <RotateIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                          className="p-2.5 min-w-[44px] min-h-[44px] sm:p-2 sm:min-w-0 sm:min-h-0 flex items-center justify-center text-[var(--ink-500)] hover:text-[var(--signal-conflict-ink)] hover:bg-[var(--signal-conflict-soft)] active:bg-[var(--signal-conflict-soft)] rounded-lg transition-colors"
                          title={t("dashboard.keysPage.revoke")}
                        >
                          <TrashIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage Guide */}
      <div className="szn-card rounded-lg p-6">
        <h2 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.keysPage.usageGuide")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-[var(--ink-900)] mb-2">{t("dashboard.keysPage.authentication")}</h3>
            <p className="text-sm text-[var(--ink-600)] mb-3">
              {t("dashboard.keysPage.authDesc")}
            </p>
            <div className="bg-[var(--ink-50)] dark:bg-[var(--ink-50)] rounded-xl p-4 overflow-x-auto">
              <code className="text-sm text-[var(--ink-600)]">x-api-key: YOUR_API_KEY</code>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--ink-900)] mb-2">{t("dashboard.keysPage.exampleRequest")}</h3>
            <div className="bg-[var(--ink-50)] dark:bg-[var(--ink-50)] rounded-xl p-4 overflow-x-auto">
              <pre className="text-sm text-[var(--ink-600)]">
{`curl -X POST \\
  https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "..."}'`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative szn-card rounded-2xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-50)] rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            {newKey ? (
              /* Key Created Success */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-gradient-to-br from-[var(--signal-canon)] to-[var(--signal-canon)] flex items-center justify-center shadow-lg">
                    <CheckIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--ink-900)]">{t("dashboard.keysPage.keyCreated")}</h2>
                  <p className="text-[var(--ink-600)] text-sm mt-1">
                    {t("dashboard.keysPage.keyCreatedDesc")}
                  </p>
                </div>

                <div className="bg-[var(--ink-50)] dark:bg-[var(--ink-50)] rounded-xl p-4 mb-4">
                  <code className="text-sm text-[var(--ink-600)] break-all">{newKey}</code>
                </div>

                <button
                  onClick={() => copyToClipboard(newKey)}
                  data-testid="copy-api-key-button"
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    copied
                      ? "bg-green-500 text-white"
                      : "theme-gradient-btn text-white"
                  }`}
                >
                  {copied ? t("dashboard.keysPage.copied") : t("dashboard.keysPage.copyToClipboard")}
                </button>

                <div className="mt-4 rounded-lg border border-[var(--ink-200)] bg-[var(--ink-50)] p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--ink-900)]">
                        {t("dashboard.keysPage.exampleRequest")}
                      </h3>
                      <p className="text-xs text-[var(--ink-600)] mt-1">
                        {t("dashboard.onboarding.steps.firstQuery.description")}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(buildExampleRequest(newKey))}
                      data-testid="copy-example-request-button"
                      className="px-3 py-1.5 rounded-lg bg-[var(--ink-50)] text-[var(--ink-900)] text-sm font-medium hover:bg-[var(--ink-50)] transition-colors"
                    >
                      {copied ? t("dashboard.keysPage.copied") : t("dashboard.keysPage.copyToClipboard")}
                    </button>
                  </div>
                  <pre className="rounded-xl bg-[var(--ink-900)] p-4 overflow-x-auto text-xs text-gray-200">
                    <code>{buildExampleRequest(newKey)}</code>
                  </pre>
                  <div className="mt-3 flex flex-col sm:flex-row gap-3">
                    <Link
                      href="/dashboard/playground"
                      data-testid="open-playground-link"
                      onClick={closeModal}
                      className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl theme-gradient-btn text-white text-sm font-medium"
                    >
                      {t("dashboard.onboarding.steps.firstQuery.action")}
                    </Link>
                    <button
                      onClick={closeModal}
                      className="flex-1 px-4 py-3 text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
                    >
                      {t("dashboard.keysPage.done")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Create Key Form */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg theme-gradient-btn flex items-center justify-center shadow-lg">
                    <KeyIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--ink-900)]">{t("dashboard.keysPage.createKeyTitle")}</h2>
                  <p className="text-[var(--ink-600)] text-sm mt-1">
                    {t("dashboard.keysPage.createKeyDesc")}
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-xl text-[var(--signal-conflict-ink)] text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="api-key-name" className="block text-sm font-medium text-[var(--ink-900)] mb-1.5">
                    {t("dashboard.keysPage.keyName")}
                  </label>
                  <input
                    id="api-key-name"
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder={t("dashboard.keysPage.keyNamePlaceholder")}
                    className="w-full px-4 py-3 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl text-[var(--ink-900)] placeholder-[var(--ink-500)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)] focus:border-transparent transition-all"
                    onKeyDown={(e) => e.key === "Enter" && createApiKey()}
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-3 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-xl font-medium hover:bg-[var(--ink-50)] transition-colors"
                  >
                    {t("dashboard.keysPage.cancel")}
                  </button>
                  <button
                    onClick={createApiKey}
                    disabled={isCreating || !newKeyName.trim()}
                    className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? t("dashboard.keysPage.creating") : t("dashboard.keysPage.createKey")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setRevokeTarget(null)}
          />
          <div className="relative szn-card rounded-2xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={() => setRevokeTarget(null)}
              className="absolute top-4 right-4 p-2 text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-50)] rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg">
                <AlertIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-[var(--ink-900)]">
                {t("dashboard.keysPage.revokeConfirm").replace("{keyName}", revokeTarget.name)}
              </h2>
              <p className="text-[var(--ink-600)] text-sm mt-2">
                {t("dashboard.keysPage.revokeWarning")}
              </p>
            </div>

            <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <KeyIcon className="w-5 h-5 text-[var(--signal-conflict-ink)] flex-shrink-0" />
                <div>
                  <p className="font-medium text-[var(--ink-900)]">{revokeTarget.name}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                className="flex-1 px-4 py-3 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-xl font-medium hover:bg-[var(--ink-50)] transition-colors"
              >
                {t("dashboard.keysPage.cancel")}
              </button>
              <button
                onClick={confirmRevoke}
                disabled={isRevoking}
                className="flex-1 bg-[var(--signal-conflict)] hover:bg-[var(--signal-conflict)] text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRevoking ? "..." : t("dashboard.keysPage.revokeAction")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotate Key Modal */}
      {rotateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={closeRotateModal}
          />
          <div className="relative szn-card rounded-2xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={closeRotateModal}
              className="absolute top-4 right-4 p-2 text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-50)] rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            {rotatedKey ? (
              /* Key Rotated Success */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-gradient-to-br from-[var(--signal-canon)] to-[var(--signal-canon)] flex items-center justify-center shadow-lg">
                    <CheckIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--ink-900)]">{t("dashboard.keysPage.keyRotated")}</h2>
                  <p className="text-[var(--ink-600)] text-sm mt-1">
                    {t("dashboard.keysPage.keyRotatedDesc")}
                  </p>
                </div>

                <div className="bg-[var(--ink-50)] dark:bg-[var(--ink-50)] rounded-xl p-4 mb-4">
                  <code className="text-sm text-[var(--ink-600)] break-all">{rotatedKey}</code>
                </div>

                <button
                  onClick={() => copyToClipboard(rotatedKey)}
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    copied
                      ? "bg-green-500 text-white"
                      : "theme-gradient-btn text-white"
                  }`}
                >
                  {copied ? t("dashboard.keysPage.copied") : t("dashboard.keysPage.copyToClipboard")}
                </button>

                <button
                  onClick={closeRotateModal}
                  className="w-full mt-3 py-3 text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
                >
                  {t("dashboard.keysPage.done")}
                </button>
              </div>
            ) : (
              /* Rotate Confirmation */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-[var(--ink-900)] flex items-center justify-center shadow-lg">
                    <RotateIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-[var(--ink-900)]">
                    {t("dashboard.keysPage.rotateConfirm").replace("{keyName}", rotateTarget.name)}
                  </h2>
                  <p className="text-[var(--ink-600)] text-sm mt-2">
                    {t("dashboard.keysPage.rotateWarning")}
                  </p>
                </div>

                <div className="bg-[var(--ink-900)]/10 border border-[var(--ink-900)]/20 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <KeyIcon className="w-5 h-5 text-[var(--ink-900)] flex-shrink-0" />
                    <div>
                      <p className="font-medium text-[var(--ink-900)]">{rotateTarget.name}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeRotateModal}
                    className="flex-1 px-4 py-3 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-xl font-medium hover:bg-[var(--ink-50)] transition-colors"
                  >
                    {t("dashboard.keysPage.cancel")}
                  </button>
                  <button
                    onClick={confirmRotate}
                    disabled={isRotating}
                    className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRotating ? "..." : t("dashboard.keysPage.rotateAction")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Icons

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function RotateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
