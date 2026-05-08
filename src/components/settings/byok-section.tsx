"use client";

import { type FormEvent, useId, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Trash2 } from "lucide-react";

const ANTHROPIC_CONSOLE_KEYS_URL = "https://console.anthropic.com/settings/keys";
const OPENAI_CONSOLE_KEYS_URL = "https://platform.openai.com/api-keys";
const GOOGLE_AI_STUDIO_KEYS_URL = "https://aistudio.google.com/apikey";
import type {
  AuthorSettingsCopy,
  ByokState,
} from "./author-settings-types";

export type ByokProvider = "anthropic" | "google" | "openai";

const PROVIDER_CONSOLES: Record<ByokProvider, { url: string; label: string; keyPrefix: string }> = {
  anthropic: {
    url: ANTHROPIC_CONSOLE_KEYS_URL,
    label: "Anthropic Console",
    keyPrefix: "sk-ant-...",
  },
  openai: {
    url: OPENAI_CONSOLE_KEYS_URL,
    label: "OpenAI Platform",
    keyPrefix: "sk-...",
  },
  google: {
    url: GOOGLE_AI_STUDIO_KEYS_URL,
    label: "Google AI Studio",
    keyPrefix: "AIza...",
  },
};

interface ByokSectionProps {
  byok: ByokState;
  copy: AuthorSettingsCopy["byok"];
  action: "idle" | "saving" | "removing";
  onSave: (apiKey: string, provider: ByokProvider) => Promise<void>;
  onRemove: (provider: ByokProvider) => Promise<void>;
}

export function ByokSection({
  byok,
  copy,
  action,
  onSave,
  onRemove,
}: ByokSectionProps) {
  const inputId = useId();
  const providerRadioId = useId();
  const [apiKey, setApiKey] = useState("");
  const initialProvider: ByokProvider =
    byok.provider === "openai" || byok.provider === "google" || byok.provider === "anthropic"
      ? byok.provider
      : "anthropic";
  const [provider, setProvider] = useState<ByokProvider>(initialProvider);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isActive = byok.enabled && byok.status === "active";
  const busy = action !== "idle";
  const consoleEntry = PROVIDER_CONSOLES[provider];
  const consoleUrl = consoleEntry.url;
  const consoleLabel = consoleEntry.label;
  const keyPrefixHint = consoleEntry.keyPrefix;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await onSave(apiKey.trim(), provider);
      setApiKey("");
      setMessage(copy.active);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    }
  }

  async function handleRemove() {
    setMessage(null);
    setError(null);
    try {
      await onRemove(provider);
      setMessage(copy.missing);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : copy.error);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5" aria-labelledby="author-settings-byok">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[var(--ink-900)]" aria-hidden="true" />
            <h2 id="author-settings-byok" className="text-lg font-semibold text-[var(--ink-900)]">
              {copy.title}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">{copy.description}</p>
        </div>
        <StatusBadge active={isActive} activeLabel={copy.active} missingLabel={copy.missing} />
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.status}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {isActive ? copy.active : byok.status === "invalid" || byok.status === "error" ? copy.error : copy.missing}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.lastFour}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {byok.key_last_4 ? `•••• ${byok.key_last_4}` : "—"}
          </dd>
        </div>
      </dl>

      <fieldset className="mt-5" aria-labelledby={`${providerRadioId}-legend`}>
        <legend id={`${providerRadioId}-legend`} className="text-sm font-medium text-[var(--ink-900)]">
          Provider
        </legend>
        <div className="mt-2 inline-flex rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-0.5">
          <ProviderRadio
            id={`${providerRadioId}-anthropic`}
            name={providerRadioId}
            value="anthropic"
            label="Anthropic"
            checked={provider === "anthropic"}
            onChange={() => setProvider("anthropic")}
          />
          <ProviderRadio
            id={`${providerRadioId}-openai`}
            name={providerRadioId}
            value="openai"
            label="OpenAI"
            checked={provider === "openai"}
            onChange={() => setProvider("openai")}
          />
          <ProviderRadio
            id={`${providerRadioId}-google`}
            name={providerRadioId}
            value="google"
            label="Google"
            checked={provider === "google"}
            onChange={() => setProvider("google")}
          />
        </div>
      </fieldset>

      {!isActive ? (
        <div
          className="mt-5 rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-4"
          aria-labelledby={`${inputId}-helper-title`}
        >
          <p
            id={`${inputId}-helper-title`}
            className="text-sm font-medium text-[var(--ink-900)]"
          >
            {copy.helper.title}
          </p>
          <a
            href={consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${consoleLabel} API keys page`}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ink-200)] bg-[var(--ink-0)] px-4 text-sm font-medium text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-900)]/40"
          >
            Open {consoleLabel}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--ink-600)]">
            <li>{copy.helper.step1}</li>
            <li>{copy.helper.step2}</li>
            <li>{copy.helper.step3}</li>
            <li>{copy.helper.step4}</li>
          </ol>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="mt-5">
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--ink-900)]">
          {copy.keyLabel} <span className="font-mono text-xs text-[var(--ink-500)]">({keyPrefixHint})</span>
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={copy.keyPlaceholder}
            className="min-h-10 w-full flex-1 rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] px-3 text-sm text-[var(--ink-900)] outline-none focus:border-[var(--ink-900)] focus:ring-2 focus:ring-[var(--ink-900)]/20"
          />
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              type="submit"
              disabled={busy || !apiKey.trim()}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--ink-900)] px-4 text-sm font-medium text-white hover:bg-[var(--ink-900)]/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {action === "saving" ? copy.saving : copy.save}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy || !isActive}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ink-200)] px-4 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {action === "removing" ? copy.removing : copy.remove}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-500)]">{copy.keyHint}</p>
      </form>

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

function ProviderRadio({
  id,
  name,
  value,
  label,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`min-h-10 cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        checked
          ? "bg-[var(--ink-900)] text-white"
          : "text-[var(--ink-700)] hover:bg-[var(--ink-0)]"
      }`}
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function StatusBadge({
  active,
  activeLabel,
  missingLabel,
}: {
  active: boolean;
  activeLabel: string;
  missingLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-[var(--signal-canon-ink)]/30 dark:text-[var(--signal-canon-soft)]"
          : "bg-[var(--ink-50)] text-[var(--ink-600)]"
      }`}
    >
      {active ? activeLabel : missingLabel}
    </span>
  );
}

