"use client";

import { useState } from "react";

type Provider = "linear" | "github" | "jira";

interface BundleResult {
  bundleUrl: string;
  expiresAt: string;
  replayHash: string;
}

export function ExportPanel({ traceId }: { traceId: string }) {
  const [provider, setProvider] = useState<Provider>("linear");
  const [issueId, setIssueId] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [bundle, setBundle] = useState<BundleResult | null>(null);

  async function createBundle() {
    setStatus("Creating replay bundle...");
    const response = await fetch(`/api/replay/bundles/${encodeURIComponent(traceId)}`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(payload?.error || "Bundle creation failed.");
      return;
    }
    setBundle(payload.bundle);
    setStatus("Replay bundle created.");
  }

  async function sendToProvider() {
    setStatus(`Sending replay to ${provider}...`);
    const body: Record<string, unknown> = {
      memory_session_id: traceId,
    };

    if (provider === "github") {
      body.owner = owner;
      body.repo = repo;
      body.issueNumber = issueNumber;
    } else if (provider === "jira") {
      body.issueKey = issueId;
    } else {
      body.issueId = issueId;
    }

    const response = await fetch(`/api/webhooks/bug-tracker/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(payload?.error || "Replay send failed.");
      return;
    }

    setBundle(payload.bundle);
    setStatus(`Replay attached to ${payload.externalIssueKey}.`);
  }

  return (
    <section className="border-y border-szn-border-subtle">
      <div className="grid gap-px bg-szn-border-subtle lg:grid-cols-[260px_1fr]">
        <div className="bg-szn-bg p-5">
          <div className="szn-section-number mb-4">EXPORT / BUG TRACKER</div>
          <p className="text-[13px] leading-[1.65] text-szn-text-2">
            Create a seven-day signed replay bundle or append it directly to a connected Linear, GitHub, or Jira ticket.
          </p>
        </div>

        <div className="bg-szn-bg p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="szn-eyebrow">Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as Provider)}
                className="mt-2 h-11 w-full border border-szn-border-subtle bg-szn-surface-1 px-3 text-[13px] text-szn-text-1 outline-none focus:border-szn-signal"
              >
                <option value="linear">Linear</option>
                <option value="github">GitHub</option>
                <option value="jira">Jira</option>
              </select>
            </label>

            {provider === "github" ? (
              <>
                <TextInput label="Owner" value={owner} onChange={setOwner} placeholder="litheonhq" />
                <TextInput label="Repo" value={repo} onChange={setRepo} placeholder="seizn" />
                <TextInput label="Issue #" value={issueNumber} onChange={setIssueNumber} placeholder="123" />
              </>
            ) : (
              <TextInput
                label={provider === "jira" ? "Issue key" : "Issue ID"}
                value={issueId}
                onChange={setIssueId}
                placeholder={provider === "jira" ? "GAME-123" : "lin_..."}
              />
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={createBundle} className="szn-btn-ghost">
              Create bundle
            </button>
            <button type="button" onClick={sendToProvider} className="szn-btn-signal">
              Send to {provider}
            </button>
          </div>

          {status && <p className="mt-4 font-mono text-[12px] text-szn-text-2">{status}</p>}
          {bundle && (
            <div className="mt-5 border-t border-szn-border-subtle pt-5">
              <a href={bundle.bundleUrl} className="font-mono text-[12px] text-szn-signal underline-offset-4 hover:underline">
                Download signed replay bundle
              </a>
              <div className="mt-2 font-mono text-[11px] leading-5 text-szn-text-3">
                expires {bundle.expiresAt}
                <br />
                hash {bundle.replayHash}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="szn-eyebrow">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full border border-szn-border-subtle bg-szn-surface-1 px-3 text-[13px] text-szn-text-1 outline-none placeholder:text-szn-text-3 focus:border-szn-signal"
      />
    </label>
  );
}
