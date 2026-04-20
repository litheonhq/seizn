"use client";

import { useState } from "react";

export function ReplayActions({ traceId }: { traceId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function runReplay(mocked: boolean) {
    setStatus(mocked ? "Running mocked replay..." : "Running live replay...");
    const response = await fetch("/api/v1/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId, mockLLM: mocked, mockTools: mocked }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(payload?.error?.message || "Replay failed.");
      return;
    }
    setStatus(payload?.data?.replay?.matchesOriginal ? "Replay matched the original output." : "Replay diverged.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runReplay(true)}
          className="rounded-md bg-szn-signal px-4 py-2 font-mono text-[12px] uppercase text-szn-bg"
        >
          Replay mocked
        </button>
        <button
          type="button"
          onClick={() => runReplay(false)}
          className="rounded-md border border-szn-border-subtle px-4 py-2 font-mono text-[12px] uppercase text-szn-text-2"
        >
          Replay live
        </button>
      </div>
      {status && <p className="font-mono text-[12px] text-szn-text-2">{status}</p>}
    </div>
  );
}
