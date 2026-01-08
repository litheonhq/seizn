"use client";

import { useState, useEffect } from "react";
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

export function DashboardClient({ user }: { user: User }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch API keys on mount
  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    // This would need the auth token - simplified for now
    // const res = await fetch("/api/keys");
    // const data = await res.json();
    // setApiKeys(data.keys);
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsLoading(true);

    // This would need the auth token
    // const res = await fetch("/api/keys", {
    //   method: "POST",
    //   body: JSON.stringify({ name: newKeyName }),
    // });
    // const data = await res.json();
    // setNewKey(data.key);
    // setApiKeys([...apiKeys, data.keyRecord]);

    // Demo: Generate a fake key
    setNewKey(`szn_demo_${Math.random().toString(36).substring(2, 15)}`);
    setIsLoading(false);
    setNewKeyName("");
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">
              {user.email}
            </span>
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
            <p className="text-3xl font-bold text-white">0</p>
            <p className="text-zinc-500 text-sm mt-1">of 10,000 (Free)</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 text-sm mb-1">API Calls Today</p>
            <p className="text-3xl font-bold text-white">0</p>
            <p className="text-zinc-500 text-sm mt-1">of 1,000 (Free)</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 text-sm mb-1">Plan</p>
            <p className="text-3xl font-bold text-emerald-400">Free</p>
            <a href="/pricing" className="text-emerald-400 text-sm hover:underline mt-1 inline-block">
              Upgrade
            </a>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">API Keys</h3>
          </div>

          {/* New Key Created */}
          {newKey && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-400 font-medium mb-2">New API Key Created</p>
              <p className="text-zinc-300 text-sm mb-2">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
              <code className="block bg-zinc-800 p-3 rounded text-sm text-white font-mono break-all">
                {newKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                }}
                className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
              >
                Copy to clipboard
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
            />
            <button
              onClick={createApiKey}
              disabled={isLoading || !newKeyName.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Create Key
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
                  <div className="text-right">
                    <p className="text-zinc-400 text-sm">
                      Created {new Date(key.created_at).toLocaleDateString()}
                    </p>
                    {key.last_used_at && (
                      <p className="text-zinc-500 text-xs">
                        Last used {new Date(key.last_used_at).toLocaleDateString()}
                      </p>
                    )}
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
curl -X POST https://api.seizn.com/memories \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers dark mode"}'

# Search memories
curl "https://api.seizn.com/memories?query=user%20preferences" \\
  -H "x-api-key: YOUR_API_KEY"`}</code>
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
