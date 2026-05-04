"use client";

import { type FormEvent, useId, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Trash2 } from "lucide-react";

const ANTHROPIC_CONSOLE_KEYS_URL = "https://console.anthropic.com/settings/keys";
import type {
  AuthorSettingsCopy,
  ByokDiscountState,
  ByokState,
} from "./author-settings-types";
import { normalizeByokDiscountStatus } from "./author-settings-types";

interface ByokSectionProps {
  byok: ByokState;
  discountStatus: unknown;
  discountError?: string | null;
  copy: AuthorSettingsCopy["byok"];
  action: "idle" | "saving" | "removing";
  onSave: (apiKey: string) => Promise<ByokDiscountState | void>;
  onRemove: () => Promise<ByokDiscountState | void>;
}

export function ByokSection({
  byok,
  discountStatus,
  discountError,
  copy,
  action,
  onSave,
  onRemove,
}: ByokSectionProps) {
  const inputId = useId();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedDiscountStatus = normalizeByokDiscountStatus(discountStatus);
  const isActive = byok.enabled && byok.status === "active";
  const busy = action !== "idle";

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const discount = await onSave(apiKey.trim());
      setApiKey("");
      setMessage(formatDiscountResult(discount, copy));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    }
  }

  async function handleRemove() {
    setMessage(null);
    setError(null);
    try {
      const discount = await onRemove();
      setMessage(formatDiscountResult(discount, copy));
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

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
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
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.discount}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {copy.discountStates[normalizedDiscountStatus]}
          </dd>
          {normalizedDiscountStatus === "error" && discountError ? (
            <p className="mt-1 text-xs text-[var(--signal-conflict-ink)]">{discountError}</p>
          ) : null}
        </div>
      </dl>

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
            href={ANTHROPIC_CONSOLE_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy.helper.buttonAriaLabel}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ink-200)] bg-[var(--ink-0)] px-4 text-sm font-medium text-[var(--ink-900)] transition-colors hover:bg-[var(--ink-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-900)]/40"
          >
            {copy.helper.buttonLabel}
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
          {copy.keyLabel}
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

function formatDiscountResult(
  discount: ByokDiscountState | void,
  copy: AuthorSettingsCopy["byok"]
): string {
  const status = normalizeByokDiscountStatus(discount?.status);
  return `${copy.discount}: ${copy.discountStates[status]}`;
}
