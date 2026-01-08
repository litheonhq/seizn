"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";

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

export function DashboardClient({ user }: { user: User }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
    fetchStats();
  }, [fetchApiKeys, fetchStats]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

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

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </a>
          <div className="flex items-center gap-4">
            {user.image && (
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
            <p className="text-3xl font-bold text-emerald-400">
              {stats?.planDisplay || "Free"}
            </p>
            <a
              href="/pricing"
              className="text-emerald-400 text-sm hover:underline mt-1 inline-block"
            >
              Upgrade
            </a>
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
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* New Key Created */}
          {newKey && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-400 font-medium mb-2">
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
                className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
          )}

          {/* Create New Key */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., Production)"
              className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onKeyDown={(e) => e.key === "Enter" && createApiKey()}
            />
            <button
              onClick={createApiKey}
              disabled={isLoading || !newKeyName.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
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
                        Created {new Date(key.created_at).toLocaleDateString()}
                      </p>
                      {key.last_used_at && (
                        <p className="text-zinc-500 text-xs">
                          Last used{" "}
                          {new Date(key.last_used_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => revokeApiKey(key.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
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
            <a
              href="/docs"
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              View full documentation →
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
