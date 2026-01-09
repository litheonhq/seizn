"use client";

import { useState, useEffect, useCallback } from "react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export default function ApiKeysClient() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/keys");
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.keys);
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        setApiKeys([data.keyRecord, ...apiKeys]);
        setNewKeyName("");
      } else {
        setError(data.error || "Failed to create key");
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
      setError("Failed to create key");
    } finally {
      setIsCreating(false);
    }
  };

  const revokeApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Revoke API key "${keyName}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/dashboard/keys?id=${keyId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setApiKeys(apiKeys.filter((k) => k.id !== keyId));
      }
    } catch (err) {
      console.error("Failed to revoke API key:", err);
    }
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
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 mt-1">
            Manage your API keys for accessing Seizn services
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="theme-gradient-btn text-white px-5 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Create New Key
        </button>
      </div>

      {/* API Keys List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b theme-border">
          <h2 className="font-semibold text-gray-900">Active Keys</h2>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-4 bg-white/50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-32" />
                  </div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <KeyIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No API keys yet
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first API key to start integrating with Seizn
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="theme-gradient-btn text-white px-6 py-2.5 rounded-xl font-medium"
            >
              Create API Key
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                    <KeyIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{key.name}</p>
                    <p className="text-sm text-gray-500 font-mono">{key.key_prefix}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm text-gray-600">
                      Created {new Date(key.created_at).toLocaleDateString("ja-JP")}
                    </p>
                    {key.last_used_at ? (
                      <p className="text-xs text-gray-400">
                        Last used {new Date(key.last_used_at).toLocaleDateString("ja-JP")}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Never used</p>
                    )}
                  </div>
                  <button
                    onClick={() => revokeApiKey(key.id, key.name)}
                    className="px-3 py-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Guide */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Usage Guide</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Authentication</h3>
            <p className="text-sm text-gray-500 mb-3">
              Include your API key in the request header:
            </p>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <code className="text-sm text-gray-300">x-api-key: YOUR_API_KEY</code>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Example Request</h3>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300">
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
          <div className="relative glass-card rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            {newKey ? (
              /* Key Created Success */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
                    <CheckIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">API Key Created!</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Copy this key now. You won&apos;t see it again.
                  </p>
                </div>

                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                  <code className="text-sm text-gray-300 break-all">{newKey}</code>
                </div>

                <button
                  onClick={() => copyToClipboard(newKey)}
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    copied
                      ? "bg-green-500 text-white"
                      : "theme-gradient-btn text-white"
                  }`}
                >
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </button>

                <button
                  onClick={closeModal}
                  className="w-full mt-3 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Create Key Form */
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl theme-gradient-btn flex items-center justify-center shadow-lg">
                    <KeyIcon className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Create API Key</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Give your key a descriptive name
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production, Development, Testing"
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
                    onKeyDown={(e) => e.key === "Enter" && createApiKey()}
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createApiKey}
                    disabled={isCreating || !newKeyName.trim()}
                    className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? "Creating..." : "Create Key"}
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
