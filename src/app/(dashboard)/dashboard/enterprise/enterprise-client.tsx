"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";

type TabType = "sso" | "scim" | "settings";

interface SSOProvider {
  id: string;
  name: string;
  description: string;
  configType: "saml" | "oidc";
}

interface SSOConfig {
  id: string;
  enabled: boolean;
  provider: string;
  domains: string[];
  defaultRole: string;
}

interface SCIMConfig {
  enabled: boolean;
  bearerToken: string;
  endpoint: string;
  syncUsers: boolean;
  syncGroups: boolean;
  autoProvision: boolean;
  autoDeprovision: boolean;
}

export function EnterpriseClient() {
  const [activeTab, setActiveTab] = useState<TabType>("sso");
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [ssoConfig, setSSOConfig] = useState<SSOConfig | null>(null);
  const [scimConfig, setSCIMConfig] = useState<SCIMConfig>({
    enabled: false,
    bearerToken: "",
    endpoint: "",
    syncUsers: true,
    syncGroups: true,
    autoProvision: true,
    autoDeprovision: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createLatestRequestGuard());

  // SSO Setup
  const [selectedProvider, setSelectedProvider] = useState("");
  const [showSSOSetup, setShowSSOSetup] = useState(false);
  const [ssoSetupStep, setSSOSetupStep] = useState(1);
  const [domains, setDomains] = useState("");

  const { t } = useDashboardTranslation();

  const loadData = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    setLoading(true);
    setError(null);
    try {
      const [providersResult, configResult] = await Promise.allSettled([
        fetch("/api/enterprise/sso?info=providers", { signal: request.signal }).then((res) => res.json()),
        fetch("/api/enterprise/sso", { signal: request.signal }).then((res) => res.json()),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      let failedCount = 0;

      if (providersResult.status === "fulfilled" && providersResult.value.success) {
        setProviders(providersResult.value.providers || []);
      } else if (
        (providersResult.status === "fulfilled" && !providersResult.value.success) ||
        (providersResult.status === "rejected" && !isAbortError(providersResult.reason))
      ) {
        failedCount += 1;
      }

      if (configResult.status === "fulfilled" && configResult.value.success && configResult.value.config) {
        setSSOConfig(configResult.value.config);
      } else if (
        (configResult.status === "fulfilled" && !configResult.value.success) ||
        (configResult.status === "rejected" && !isAbortError(configResult.reason))
      ) {
        failedCount += 1;
      }

      if (failedCount > 0) {
        setError("Some enterprise settings could not be refreshed.");
      }
    } catch (error) {
      if (!isAbortError(error) && requestGuardRef.current.isCurrent(request.id)) {
        setError(getErrorMessage(error, "Failed to load enterprise settings."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setLoading(false);
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    loadData();
    return () => requestGuard.cancel();
  }, [loadData]);

  const handleEnableSSO = async () => {
    // In production, this would submit the SSO configuration
    alert(t("dashboard.enterpriseDashboard.sso.configSaved"));
    setShowSSOSetup(false);
    setSSOSetupStep(1);
    loadData();
  };

  const handleGenerateSCIMToken = () => {
    const token = `szn_scim_${crypto.randomUUID().replace(/-/g, "")}`;
    setSCIMConfig({ ...scimConfig, bearerToken: token, enabled: true });
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
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.title")}</h1>
          <span className="px-2 py-0.5 text-xs bg-[var(--ink-100)] text-[var(--ink-900)] underline rounded-full">
            {t("dashboard.enterpriseDashboard.badge")}
          </span>
        </div>
        <p className="text-[var(--ink-600)] mt-1">
          {t("dashboard.enterpriseDashboard.subtitle")}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)] dark:border-[var(--signal-pending)]/60 dark:bg-[var(--signal-pending)]/30 dark:text-[var(--signal-pending-soft)]">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--ink-50)] rounded-lg p-1 w-fit">
        {(["sso", "scim", "settings"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            }`}
          >
            {tab === "sso" && t("dashboard.enterpriseDashboard.tabs.sso")}
            {tab === "scim" && t("dashboard.enterpriseDashboard.tabs.scim")}
            {tab === "settings" && t("dashboard.enterpriseDashboard.tabs.settings")}
          </button>
        ))}
      </div>

      {/* SSO Tab */}
      {activeTab === "sso" && (
        <div className="space-y-6">
          {ssoConfig ? (
            <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--ink-900)]/10 rounded-lg flex items-center justify-center">
                    <span className="text-lg">🔐</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.enabled")}</h3>
                    <p className="text-sm text-[var(--ink-600)]">
                      {t("dashboard.enterpriseDashboard.sso.provider")} {ssoConfig.provider} | {t("dashboard.enterpriseDashboard.sso.domains")} {ssoConfig.domains.join(", ")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-[var(--ink-50)]">
                    {t("dashboard.enterpriseDashboard.sso.testConnection")}
                  </button>
                  <button className="px-3 py-1.5 text-sm text-[var(--signal-conflict-ink)] border border-[var(--signal-conflict)] rounded-lg hover:bg-[var(--signal-conflict-soft)]">
                    {t("dashboard.enterpriseDashboard.sso.disable")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-[var(--ink-50)] rounded-lg">
                <div>
                  <span className="text-sm text-[var(--ink-600)]">{t("dashboard.enterpriseDashboard.sso.defaultRole")}</span>
                  <p className="text-[var(--ink-900)] capitalize">{ssoConfig.defaultRole}</p>
                </div>
                <div>
                  <span className="text-sm text-[var(--ink-600)]">{t("dashboard.enterpriseDashboard.sso.status")}</span>
                  <p className="text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.active")}</p>
                </div>
                <div>
                  <span className="text-sm text-[var(--ink-600)]">{t("dashboard.enterpriseDashboard.sso.lastLogin")}</span>
                  <p className="text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.hoursAgo")}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <span className="text-3xl">🔐</span>
              </div>
              <h3 className="font-semibold text-[var(--ink-900)] mb-2">
                {t("dashboard.enterpriseDashboard.sso.notConfigured")}
              </h3>
              <p className="text-[var(--ink-600)] mb-6 max-w-md mx-auto">
                {t("dashboard.enterpriseDashboard.sso.notConfiguredDesc")}
              </p>
              <button
                onClick={() => setShowSSOSetup(true)}
                className="px-6 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
              >
                {t("dashboard.enterpriseDashboard.sso.configure")}
              </button>
            </div>
          )}

          {/* Provider Selection */}
          {!ssoConfig && !showSSOSetup && (
            <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
              <h3 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.enterpriseDashboard.sso.supportedProviders")}</h3>
              <div className="grid grid-cols-3 gap-4">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="p-4 border rounded-lg hover:border-gray-300"
                  >
                    <h4 className="font-medium text-[var(--ink-900)]">{provider.name}</h4>
                    <p className="text-sm text-[var(--ink-600)] mt-1">{provider.description}</p>
                    <span className="text-xs text-[var(--ink-500)] mt-2 block">
                      {provider.configType.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCIM Tab */}
      {activeTab === "scim" && (
        <div className="space-y-6">
          <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.scim.title")}</h3>
                <p className="text-sm text-[var(--ink-600)] mt-1">
                  {t("dashboard.enterpriseDashboard.scim.subtitle")}
                </p>
              </div>
              <button
                onClick={() =>
                  setSCIMConfig({ ...scimConfig, enabled: !scimConfig.enabled })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  scimConfig.enabled ? "bg-[var(--ink-900)]" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    scimConfig.enabled ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {scimConfig.enabled && (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
                      {t("dashboard.enterpriseDashboard.scim.endpoint")}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/scim/v2`}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
                      {t("dashboard.enterpriseDashboard.scim.bearerToken")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        readOnly
                        value={scimConfig.bearerToken || "••••••••••••••••"}
                        className="flex-1 px-3 py-2 border rounded-lg bg-gray-50"
                      />
                      <button
                        onClick={handleGenerateSCIMToken}
                        className="px-4 py-2 border rounded-lg hover:bg-[var(--ink-50)]"
                      >
                        {scimConfig.bearerToken ? t("dashboard.enterpriseDashboard.scim.regenerate") : t("dashboard.enterpriseDashboard.scim.generate")}
                      </button>
                    </div>
                    {scimConfig.bearerToken && (
                      <p className="text-xs text-[var(--signal-pending-ink)] mt-1">
                        {t("dashboard.enterpriseDashboard.scim.tokenWarning")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.scim.syncUsers")}</span>
                      <p className="text-sm text-[var(--ink-600)]">
                        {t("dashboard.enterpriseDashboard.scim.syncUsersDesc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={scimConfig.syncUsers}
                      onChange={(e) =>
                        setSCIMConfig({ ...scimConfig, syncUsers: e.target.checked })
                      }
                      className="w-5 h-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.scim.syncGroups")}</span>
                      <p className="text-sm text-[var(--ink-600)]">
                        {t("dashboard.enterpriseDashboard.scim.syncGroupsDesc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={scimConfig.syncGroups}
                      onChange={(e) =>
                        setSCIMConfig({ ...scimConfig, syncGroups: e.target.checked })
                      }
                      className="w-5 h-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.scim.autoProvision")}</span>
                      <p className="text-sm text-[var(--ink-600)]">
                        {t("dashboard.enterpriseDashboard.scim.autoProvisionDesc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={scimConfig.autoProvision}
                      onChange={(e) =>
                        setSCIMConfig({ ...scimConfig, autoProvision: e.target.checked })
                      }
                      className="w-5 h-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.scim.autoDeprovision")}</span>
                      <p className="text-sm text-[var(--ink-600)]">
                        {t("dashboard.enterpriseDashboard.scim.autoDeprovisionDesc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={scimConfig.autoDeprovision}
                      onChange={(e) =>
                        setSCIMConfig({
                          ...scimConfig,
                          autoDeprovision: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
            <h3 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.enterpriseDashboard.features.title")}</h3>
            <div className="grid grid-cols-2 gap-4">
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.sso")}
                description={t("dashboard.enterpriseDashboard.features.ssoDesc")}
                enabled={!!ssoConfig}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.scim")}
                description={t("dashboard.enterpriseDashboard.features.scimDesc")}
                enabled={scimConfig.enabled}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.auditLogs")}
                description={t("dashboard.enterpriseDashboard.features.auditLogsDesc")}
                enabled={true}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.customDomains")}
                description={t("dashboard.enterpriseDashboard.features.customDomainsDesc")}
                enabled={false}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.ipWhitelist")}
                description={t("dashboard.enterpriseDashboard.features.ipWhitelistDesc")}
                enabled={false}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.dataRetention")}
                description={t("dashboard.enterpriseDashboard.features.dataRetentionDesc")}
                enabled={true}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.advancedAnalytics")}
                description={t("dashboard.enterpriseDashboard.features.advancedAnalyticsDesc")}
                enabled={true}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
              <FeatureCard
                name={t("dashboard.enterpriseDashboard.features.sla")}
                description={t("dashboard.enterpriseDashboard.features.slaDesc")}
                enabled={true}
                enabledLabel={t("dashboard.enterpriseDashboard.features.enabled")}
                disabledLabel={t("dashboard.enterpriseDashboard.features.disabled")}
              />
            </div>
          </div>

          <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
            <h3 className="font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.enterpriseDashboard.limits.title")}</h3>
            <div className="grid grid-cols-3 gap-6">
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.users")} value={t("dashboard.enterpriseDashboard.limits.unlimited")} max="∞" />
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.apiCalls")} value={t("dashboard.enterpriseDashboard.limits.apiCallsValue")} max="10,000,000" />
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.storage")} value={t("dashboard.enterpriseDashboard.limits.storageValue")} max="1,000 GB" />
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.collections")} value={t("dashboard.enterpriseDashboard.limits.unlimited")} max="∞" />
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.documents")} value={t("dashboard.enterpriseDashboard.limits.unlimited")} max="∞" />
              <LimitCard label={t("dashboard.enterpriseDashboard.limits.retention")} value={t("dashboard.enterpriseDashboard.limits.retentionValue")} max="365" />
            </div>
          </div>

          <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.support.title")}</h3>
                <p className="text-sm text-[var(--ink-600)] mt-1">
                  {t("dashboard.enterpriseDashboard.support.subtitle")}
                </p>
              </div>
              <a
                href="mailto:enterprise@seizn.com"
                className="px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90"
              >
                {t("dashboard.enterpriseDashboard.support.contact")}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* SSO Setup Modal */}
      {showSSOSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--ink-0)] rounded-lg max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.configure")}</h2>
              <button
                onClick={() => setShowSSOSetup(false)}
                className="text-[var(--ink-500)] hover:text-[var(--ink-600)]"
              >
                ✕
              </button>
            </div>

            {/* Step indicators */}
            <div className="flex gap-2 mb-6">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`flex-1 h-1 rounded-full ${
                    step <= ssoSetupStep ? "bg-[var(--ink-900)]" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            {ssoSetupStep === 1 && (
              <div className="space-y-4">
                <h3 className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.selectProvider")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        selectedProvider === provider.id
                          ? "border-[var(--ink-900)] bg-[var(--ink-900)]/10"
                          : "border-[var(--ink-200)] hover:border-[var(--ink-200)]/80"
                      }`}
                    >
                      <h4 className="font-medium text-[var(--ink-900)]">{provider.name}</h4>
                      <p className="text-sm text-[var(--ink-600)]">{provider.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ssoSetupStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.configureDomains")}</h3>
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-900)] mb-1">
                    {t("dashboard.enterpriseDashboard.sso.emailDomains")}
                  </label>
                  <input
                    type="text"
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                    placeholder="example.com, corp.example.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-sm text-[var(--ink-600)] mt-1">
                    {t("dashboard.enterpriseDashboard.sso.emailDomainsHint")}
                  </p>
                </div>
              </div>
            )}

            {ssoSetupStep === 3 && (
              <div className="space-y-4">
                <h3 className="font-medium text-[var(--ink-900)]">{t("dashboard.enterpriseDashboard.sso.idpConfig")}</h3>
                <div className="p-4 bg-[var(--ink-50)] rounded-lg">
                  <p className="text-sm text-[var(--ink-600)] mb-2">
                    {t("dashboard.enterpriseDashboard.sso.idpCopyHint")}
                  </p>
                  <div className="space-y-2 font-mono text-sm">
                    <div>
                      <span className="text-[var(--ink-600)]">{t("dashboard.enterpriseDashboard.sso.acsUrl")}</span>{" "}
                      <span className="text-[var(--ink-900)]">
                        https://app.seizn.com/api/auth/sso/callback
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-600)]">{t("dashboard.enterpriseDashboard.sso.entityId")}</span>{" "}
                      <span className="text-[var(--ink-900)]">
                        https://app.seizn.com/api/auth/sso/metadata
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              {ssoSetupStep > 1 && (
                <button
                  onClick={() => setSSOSetupStep(ssoSetupStep - 1)}
                  className="px-4 py-2 border rounded-lg hover:bg-[var(--ink-50)]"
                >
                  {t("dashboard.enterpriseDashboard.sso.back")}
                </button>
              )}
              <button
                onClick={() => {
                  if (ssoSetupStep < 3) {
                    setSSOSetupStep(ssoSetupStep + 1);
                  } else {
                    handleEnableSSO();
                  }
                }}
                disabled={ssoSetupStep === 1 && !selectedProvider}
                className="flex-1 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90 disabled:opacity-50"
              >
                {ssoSetupStep < 3 ? t("dashboard.enterpriseDashboard.sso.continue") : t("dashboard.enterpriseDashboard.sso.enableSSO")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  name,
  description,
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  name: string;
  description: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div>
        <p className="font-medium text-[var(--ink-900)]">{name}</p>
        <p className="text-sm text-[var(--ink-600)]">{description}</p>
      </div>
      {enabled ? (
        <span className="px-2 py-1 text-xs bg-[var(--signal-canon)]/10 text-[var(--signal-canon)] rounded-full">
          {enabledLabel}
        </span>
      ) : (
        <span className="px-2 py-1 text-xs bg-[var(--ink-50)] text-[var(--ink-600)] rounded-full">
          {disabledLabel}
        </span>
      )}
    </div>
  );
}

function LimitCard({
  label,
  value,
  max: _max,
}: {
  label: string;
  value: string;
  max: string;
}) {
  return (
    <div className="p-4 bg-[var(--ink-50)] rounded-lg">
      <p className="text-sm text-[var(--ink-600)]">{label}</p>
      <p className="text-xl font-bold text-[var(--ink-900)] mt-1">{value}</p>
    </div>
  );
}
