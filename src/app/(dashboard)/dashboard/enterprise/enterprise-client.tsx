"use client";

import { useState, useEffect } from "react";

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

  // SSO Setup
  const [selectedProvider, setSelectedProvider] = useState("");
  const [showSSOSetup, setShowSSOSetup] = useState(false);
  const [ssoSetupStep, setSSOSetupStep] = useState(1);
  const [domains, setDomains] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load SSO providers
      const providersRes = await fetch("/api/enterprise/sso?info=providers");
      const providersData = await providersRes.json();
      if (providersData.success) {
        setProviders(providersData.providers || []);
      }

      // Load SSO config
      const configRes = await fetch("/api/enterprise/sso");
      const configData = await configRes.json();
      if (configData.success && configData.config) {
        setSSOConfig(configData.config);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableSSO = async () => {
    // In production, this would submit the SSO configuration
    alert("SSO configuration saved!");
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
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Enterprise</h1>
          <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
            Enterprise Plan
          </span>
        </div>
        <p className="text-gray-500 mt-1">
          Configure SSO, SCIM, and enterprise settings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(["sso", "scim", "settings"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "sso" && "Single Sign-On"}
            {tab === "scim" && "User Provisioning"}
            {tab === "settings" && "Settings"}
          </button>
        ))}
      </div>

      {/* SSO Tab */}
      {activeTab === "sso" && (
        <div className="space-y-6">
          {ssoConfig ? (
            <div className="bg-white rounded-2xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">🔐</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">SSO Enabled</h3>
                    <p className="text-sm text-gray-500">
                      Provider: {ssoConfig.provider} | Domains: {ssoConfig.domains.join(", ")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                    Test Connection
                  </button>
                  <button className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                    Disable
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm text-gray-500">Default Role</span>
                  <p className="text-gray-900 capitalize">{ssoConfig.defaultRole}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Status</span>
                  <p className="text-emerald-600">Active</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Last Login</span>
                  <p className="text-gray-900">2 hours ago</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <span className="text-3xl">🔐</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Single Sign-On Not Configured
              </h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Enable SSO to allow your team members to log in with their corporate
                identity provider
              </p>
              <button
                onClick={() => setShowSSOSetup(true)}
                className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
              >
                Configure SSO
              </button>
            </div>
          )}

          {/* Provider Selection */}
          {!ssoConfig && !showSSOSetup && (
            <div className="bg-white rounded-2xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Supported Providers</h3>
              <div className="grid grid-cols-3 gap-4">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="p-4 border rounded-lg hover:border-gray-300"
                  >
                    <h4 className="font-medium text-gray-900">{provider.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{provider.description}</p>
                    <span className="text-xs text-gray-400 mt-2 block">
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
          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-gray-900">SCIM Provisioning</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Automatically sync users and groups from your identity provider
                </p>
              </div>
              <button
                onClick={() =>
                  setSCIMConfig({ ...scimConfig, enabled: !scimConfig.enabled })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  scimConfig.enabled ? "bg-emerald-500" : "bg-gray-200"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SCIM Endpoint
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/scim/v2`}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bearer Token
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
                        className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        {scimConfig.bearerToken ? "Regenerate" : "Generate"}
                      </button>
                    </div>
                    {scimConfig.bearerToken && (
                      <p className="text-xs text-yellow-600 mt-1">
                        Copy this token now. It won&apos;t be shown again.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium text-gray-900">Sync Users</span>
                      <p className="text-sm text-gray-500">
                        Import and sync user accounts
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
                      <span className="font-medium text-gray-900">Sync Groups</span>
                      <p className="text-sm text-gray-500">
                        Import and sync group memberships
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
                      <span className="font-medium text-gray-900">Auto-Provision</span>
                      <p className="text-sm text-gray-500">
                        Automatically create new users
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
                      <span className="font-medium text-gray-900">Auto-Deprovision</span>
                      <p className="text-sm text-gray-500">
                        Automatically disable removed users
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
          <div className="bg-white rounded-2xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Enterprise Features</h3>
            <div className="grid grid-cols-2 gap-4">
              <FeatureCard
                name="SSO"
                description="Single Sign-On with SAML/OIDC"
                enabled={!!ssoConfig}
              />
              <FeatureCard
                name="SCIM"
                description="Automated user provisioning"
                enabled={scimConfig.enabled}
              />
              <FeatureCard
                name="Audit Logs"
                description="Complete activity history"
                enabled={true}
              />
              <FeatureCard
                name="Custom Domains"
                description="Use your own domain"
                enabled={false}
              />
              <FeatureCard
                name="IP Whitelist"
                description="Restrict access by IP"
                enabled={false}
              />
              <FeatureCard
                name="Data Retention"
                description="Custom retention policies"
                enabled={true}
              />
              <FeatureCard
                name="Advanced Analytics"
                description="Detailed usage reports"
                enabled={true}
              />
              <FeatureCard
                name="SLA"
                description="99.9% uptime guarantee"
                enabled={true}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Plan Limits</h3>
            <div className="grid grid-cols-3 gap-6">
              <LimitCard label="Users" value="Unlimited" max="∞" />
              <LimitCard label="API Calls" value="10M / month" max="10,000,000" />
              <LimitCard label="Storage" value="1TB" max="1,000 GB" />
              <LimitCard label="Collections" value="Unlimited" max="∞" />
              <LimitCard label="Documents" value="Unlimited" max="∞" />
              <LimitCard label="Retention" value="365 days" max="365" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Dedicated Support</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Priority support with dedicated account manager
                </p>
              </div>
              <a
                href="mailto:enterprise@seizn.com"
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      )}

      {/* SSO Setup Modal */}
      {showSSOSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Configure SSO</h2>
              <button
                onClick={() => setShowSSOSetup(false)}
                className="text-gray-400 hover:text-gray-600"
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
                    step <= ssoSetupStep ? "bg-emerald-500" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            {ssoSetupStep === 1 && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Select Provider</h3>
                <div className="grid grid-cols-2 gap-3">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        selectedProvider === provider.id
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <h4 className="font-medium text-gray-900">{provider.name}</h4>
                      <p className="text-sm text-gray-500">{provider.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ssoSetupStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Configure Domains</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Domains
                  </label>
                  <input
                    type="text"
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                    placeholder="example.com, corp.example.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Users with these email domains will be redirected to SSO
                  </p>
                </div>
              </div>
            )}

            {ssoSetupStep === 3 && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">IdP Configuration</h3>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">
                    Copy these values to your Identity Provider:
                  </p>
                  <div className="space-y-2 font-mono text-sm">
                    <div>
                      <span className="text-gray-500">ACS URL:</span>{" "}
                      <span className="text-gray-900">
                        https://app.seizn.com/api/auth/sso/callback
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Entity ID:</span>{" "}
                      <span className="text-gray-900">
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
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Back
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
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
              >
                {ssoSetupStep < 3 ? "Continue" : "Enable SSO"}
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
}: {
  name: string;
  description: string;
  enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div>
        <p className="font-medium text-gray-900">{name}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {enabled ? (
        <span className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full">
          Enabled
        </span>
      ) : (
        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded-full">
          Disabled
        </span>
      )}
    </div>
  );
}

function LimitCard({
  label,
  value,
  max,
}: {
  label: string;
  value: string;
  max: string;
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
