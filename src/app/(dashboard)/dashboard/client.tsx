"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { readApiJson } from "@/lib/client/api-json";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { getErrorMessage } from "@/lib/ui-error";
import { formatDate } from "@/lib/format-date";
import { authorTabHref } from "@/lib/dashboard-routes";

interface User {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface Stats {
  memories: {
    count: number;
    limit: number;
    percentage: number;
  };
  apiCalls: {
    today: number;
    limit: number;
    percentage: number;
  };
  keys: number;
  plan: string;
  planDisplay: string;
}

type ApiKeysResponse = {
  success?: boolean;
  keys?: ApiKey[];
  key?: string;
  keyRecord?: ApiKey;
  error?: unknown;
};

type DashboardStatsResponse = {
  success?: boolean;
  stats?: Stats;
  error?: unknown;
};

export function DashboardClient({ user }: { user: User }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestGuardRef = useRef(createLatestRequestGuard());

  const fetchDashboardData = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    try {
      setLoadError(null);
      const [keysResult, statsResult] = await Promise.allSettled([
        fetch("/api/dashboard/keys", { signal: request.signal }).then((res) =>
          readApiJson<ApiKeysResponse>(res, "Failed to load API keys")
        ),
        fetch("/api/dashboard/stats", { signal: request.signal }).then((res) =>
          readApiJson<DashboardStatsResponse>(res, "Failed to load dashboard stats")
        ),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      let failedCount = 0;

      if (keysResult.status === "fulfilled" && keysResult.value.success) {
        setApiKeys(keysResult.value.keys ?? []);
      } else if (
        (keysResult.status === "fulfilled" && !keysResult.value.success) ||
        (keysResult.status === "rejected" && !isAbortError(keysResult.reason))
      ) {
        failedCount += 1;
      }

      if (statsResult.status === "fulfilled" && statsResult.value.success) {
        setStats(statsResult.value.stats ?? null);
      } else if (
        (statsResult.status === "fulfilled" && !statsResult.value.success) ||
        (statsResult.status === "rejected" && !isAbortError(statsResult.reason))
      ) {
        failedCount += 1;
      }

      if (failedCount > 0) {
        setLoadError("Some dashboard data could not be refreshed.");
      }
    } catch (err) {
      if (!isAbortError(err) && requestGuardRef.current.isCurrent(request.id)) {
        setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  const prewarmCsrf = useCallback(() => {
    void fetch("/api/csrf", {
      credentials: "include",
      cache: "no-store",
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    fetchDashboardData();
    return () => requestGuard.cancel();
  }, [fetchDashboardData]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await csrfFetch("/api/dashboard/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await readApiJson<ApiKeysResponse>(res, "Failed to create key");

      if (data.success && data.key && data.keyRecord) {
        const createdKey = data.key;
        const keyRecord = data.keyRecord;
        setNewKey(createdKey);
        setApiKeys((currentKeys) => [keyRecord, ...currentKeys]);
        setStats((currentStats) =>
          currentStats
            ? {
                ...currentStats,
                keys: currentStats.keys + 1,
              }
            : currentStats
        );
        setNewKeyName("");
      } else {
        throw new Error(getErrorMessage(data.error, "Failed to create key"));
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
      setError(getErrorMessage(err, "Failed to create key"));
    } finally {
      setIsLoading(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    try {
      const res = await csrfFetch(`/api/dashboard/keys?id=${keyId}`, {
        method: "DELETE",
      });
      const data = await readApiJson<ApiKeysResponse>(res, "Failed to revoke API key");

      if (data.success) {
        setApiKeys((currentKeys) => currentKeys.filter((k) => k.id !== keyId));
        setStats((currentStats) =>
          currentStats
            ? {
                ...currentStats,
                keys: Math.max(0, currentStats.keys - 1),
              }
            : currentStats
        );
      } else {
        throw new Error(getErrorMessage(data.error, "Failed to revoke API key."));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to revoke API key."));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Seizn<span className="text-[var(--ink-900)]">.</span>
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-4">
              <Link href="/dashboard" className="text-white text-sm">
                Dashboard
              </Link>
              <Link
                href={authorTabHref("usage")}
                className="text-zinc-400 hover:text-white text-sm"
              >
                Usage
              </Link>
            </nav>
            {user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name || "Avatar"}
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-zinc-400 text-sm">{user.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome, {user.name || user.email}
          </h2>
          <p className="text-zinc-400">
            Manage your API keys and view your usage.
          </p>
        </div>

        {loadError && (
          <div className="mb-6 rounded-lg border border-[var(--signal-pending)]/30 bg-[var(--signal-pending)]/10 p-4 text-sm text-[var(--signal-pending-soft)]">
            {loadError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 text-sm mb-1">Memories</p>
            <p className="text-3xl font-bold text-white">
              {stats?.memories.count.toLocaleString() || "0"}
            </p>
            <p className="text-zinc-500 text-sm mt-1">
              of{" "}
              {stats?.memories.limit === -1
                ? "Unlimited"
                : stats?.memories.limit.toLocaleString() || "10,000"}{" "}
              ({stats?.planDisplay || "Free"})
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 text-sm mb-1">API Calls Today</p>
            <p className="text-3xl font-bold text-white">
              {stats?.apiCalls.today.toLocaleString() || "0"}
            </p>
            <p className="text-zinc-500 text-sm mt-1">
              of{" "}
              {stats?.apiCalls.limit === -1
                ? "Unlimited"
                : stats?.apiCalls.limit.toLocaleString() || "1,000"}{" "}
              ({stats?.planDisplay || "Free"})
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 text-sm mb-1">Plan</p>
            <p className="text-3xl font-bold text-[var(--ink-900)]">
              {stats?.planDisplay || "Free"}
            </p>
            <Link
              href="/pricing"
              className="text-[var(--ink-900)] text-sm hover:underline mt-1 inline-block"
            >
              Upgrade
            </Link>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">API Keys</h3>
            <span className="text-zinc-500 text-sm">
              {apiKeys.length} key{apiKeys.length !== 1 && "s"}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-[var(--signal-conflict)]/10 border border-[var(--signal-conflict)]/20 rounded-lg text-[var(--signal-conflict-soft)] text-sm">
              {error}
            </div>
          )}

          {/* New Key Created */}
          {newKey && (
            <div className="mb-6 p-4 bg-[var(--ink-900)]/10 border border-[var(--ink-900)]/20 rounded-lg">
              <p className="text-[var(--ink-900)] font-medium mb-2">
                New API Key Created
              </p>
              <p className="text-zinc-300 text-sm mb-2">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
              <code className="block bg-zinc-800 p-3 rounded text-sm text-white font-mono break-all">
                {newKey}
              </code>
              <button
                onClick={() => copyToClipboard(newKey)}
                className="mt-3 text-sm text-[var(--ink-900)] hover:text-[var(--ink-900)]/80"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
          )}

          {/* Create New Key */}
          <div className="flex gap-3 mb-6">
            <input aria-label="New Key Name"
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onFocus={prewarmCsrf}
              placeholder="Key name (e.g., Production)"
              className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
              onKeyDown={(e) => e.key === "Enter" && createApiKey()}
            />
            <button
              onClick={createApiKey}
              disabled={isLoading || !newKeyName.trim()}
              className="px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Create Key"}
            </button>
          </div>

          {/* Keys List */}
          <div className="space-y-3">
            {apiKeys.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">
                No API keys yet. Create one to get started.
              </p>
            ) : (
              apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg"
                >
                  <div>
                    <p className="text-white font-medium">{key.name}</p>
                    <p className="text-zinc-500 text-sm font-mono">
                      {key.key_prefix}...
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-zinc-400 text-sm">
                        Created {formatDate(key.created_at)}
                      </p>
                      {key.last_used_at && (
                        <p className="text-zinc-500 text-xs">
                          Last used{" "}
                          {formatDate(key.last_used_at)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => revokeApiKey(key.id)}
                      className="text-[var(--signal-conflict-soft)] hover:text-[var(--signal-conflict-soft)] text-sm"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Start */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Start</h3>
          <div className="bg-zinc-800 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-zinc-300">
              <code>{`# Add a memory
curl -X POST https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers dark mode"}'

# Search memories
curl "https://seizn.com/api/memories?query=user%20preferences" \\
  -H "x-api-key: YOUR_API_KEY"

# Extract memories from conversation
curl -X POST https://seizn.com/api/extract \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "I love Python"}]}'`}</code>
            </pre>
          </div>
          <div className="mt-4">
            <Link
              href="/docs"
              className="text-[var(--ink-900)] hover:text-[var(--ink-900)]/80 text-sm"
            >
              View full documentation →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
