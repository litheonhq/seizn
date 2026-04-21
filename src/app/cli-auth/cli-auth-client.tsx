"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, KeyRound, RefreshCw, Terminal } from "lucide-react";

interface CliAuthClientProps {
  email: string;
}

export function CliAuthClient({ email }: CliAuthClientProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);

  const loginCommand = useMemo(
    () => (apiKey ? `seizn login --token ${apiKey}` : "seizn login"),
    [apiKey]
  );

  async function createKey() {
    setError(null);
    setCopied(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/dashboard/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Seizn CLI" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.key) {
        throw new Error(payload?.error?.message || payload?.message || "Failed to create CLI key");
      }
      setApiKey(payload.key);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create CLI key");
    } finally {
      setIsCreating(false);
    }
  }

  async function copy(value: string, target: "token" | "command") {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex h-11 w-11 items-center justify-center border border-szn-signal-line bg-szn-signal-soft text-szn-signal">
          <KeyRound className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold text-szn-text-1">Create CLI key</h2>
        <p className="mt-2 text-sm leading-6 text-szn-text-2">
          Signed in as {email || "Seizn user"}.
        </p>
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={createKey}
        disabled={isCreating}
        className="inline-flex w-full items-center justify-center gap-2 bg-szn-signal px-4 py-3 text-sm font-semibold text-szn-signal-fg transition hover:bg-szn-signal-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {apiKey ? "Rotate CLI key" : "Generate CLI key"}
      </button>

      <div className="space-y-4">
        <SecretBlock
          label="API key"
          value={apiKey || "Generated key appears once"}
          disabled={!apiKey}
          copied={copied === "token"}
          onCopy={() => apiKey && copy(apiKey, "token")}
        />
        <SecretBlock
          label="Login command"
          value={loginCommand}
          disabled={!apiKey}
          copied={copied === "command"}
          onCopy={() => apiKey && copy(loginCommand, "command")}
          icon={<Terminal className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

function SecretBlock({
  label,
  value,
  disabled,
  copied,
  onCopy,
  icon,
}: {
  label: string;
  value: string;
  disabled: boolean;
  copied: boolean;
  onCopy: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="border border-szn-border-subtle bg-szn-bg">
      <div className="flex items-center justify-between gap-3 border-b border-szn-border-subtle px-4 py-3">
        <span className="text-xs uppercase tracking-[0.16em] text-szn-text-3">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center border border-szn-border-subtle text-szn-text-2 transition hover:border-szn-signal-line hover:text-szn-signal disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex min-h-16 items-center gap-3 px-4 py-4">
        {icon ? <span className="text-szn-text-3">{icon}</span> : null}
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-6 text-szn-text-1">
          {value}
        </code>
      </div>
    </div>
  );
}
