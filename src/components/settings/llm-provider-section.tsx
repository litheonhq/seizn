"use client";

import { useState } from "react";
import { Bot, CheckCircle2, AlertCircle } from "lucide-react";

export type AuthorLlmProvider = "anthropic" | "openai";

export interface LlmProviderState {
  /** null = user hasn't set a preference, falls through to env default */
  provider: AuthorLlmProvider | null;
  /** Whatever AUTHOR_LLM_PROVIDER env resolves to today (display only). */
  env_default: string;
}

interface LlmProviderSectionProps {
  state: LlmProviderState;
  busy: boolean;
  onSave: (provider: AuthorLlmProvider | null) => Promise<void>;
}

const PROVIDER_LABELS: Record<AuthorLlmProvider, { name: string; tagline: string }> = {
  anthropic: {
    name: "Anthropic Claude Opus 4.7",
    tagline: "Extended thinking · 1M context · longest-form prose",
  },
  openai: {
    name: "OpenAI GPT-5.5",
    tagline: "Reasoning xhigh · 1M context · structured output",
  },
};

export function LlmProviderSection({ state, busy, onSave }: LlmProviderSectionProps) {
  const [pending, setPending] = useState<AuthorLlmProvider | "default" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effective: AuthorLlmProvider =
    state.provider ?? (state.env_default === "openai" ? "openai" : "anthropic");

  async function handleSelect(next: AuthorLlmProvider | null) {
    setMessage(null);
    setError(null);
    setPending(next ?? "default");
    try {
      await onSave(next);
      setMessage(
        next === null
          ? `Reverted to default (${PROVIDER_LABELS[effective].name})`
          : `Switched to ${PROVIDER_LABELS[next].name}`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save preference");
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5"
      aria-labelledby="author-settings-llm-provider"
    >
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-[var(--ink-900)]" aria-hidden="true" />
        <h2 id="author-settings-llm-provider" className="text-lg font-semibold text-[var(--ink-900)]">
          AI provider
        </h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">
        Pick which frontier model writes your Author Memory v3 prose. Both run at xhigh reasoning
        effort. Switching is instant — your next request hits the new provider.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(["anthropic", "openai"] as const).map((provider) => {
          const isActive = state.provider === provider;
          const isEffective = !isActive && effective === provider && state.provider == null;
          const isPending = pending === provider;
          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleSelect(provider)}
              disabled={busy || isPending || isActive}
              className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors ${
                isActive
                  ? "border-[var(--ink-900)] bg-[var(--ink-50)]"
                  : "border-[var(--ink-200)] hover:bg-[var(--ink-50)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-pressed={isActive}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--ink-900)]">
                  {PROVIDER_LABELS[provider].name}
                </span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--signal-canon-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--signal-canon-ink)]">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Active
                  </span>
                ) : isEffective ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ink-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-600)]">
                    Default
                  </span>
                ) : null}
              </div>
              <span className="text-xs leading-5 text-[var(--ink-600)]">
                {PROVIDER_LABELS[provider].tagline}
              </span>
            </button>
          );
        })}
      </div>

      {state.provider !== null ? (
        <button
          type="button"
          onClick={() => handleSelect(null)}
          disabled={busy || pending === "default"}
          className="mt-3 text-xs text-[var(--ink-600)] underline hover:text-[var(--ink-900)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "default" ? "Reverting..." : "Revert to default"}
        </button>
      ) : null}

      {message ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--signal-canon)] bg-[var(--signal-canon-soft)] p-3 text-sm text-[var(--signal-canon-ink)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] p-3 text-sm text-[var(--signal-conflict-ink)]">
          <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
