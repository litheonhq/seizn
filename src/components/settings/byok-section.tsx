"use client";

import { type FormEvent, useId, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Trash2 } from "lucide-react";
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
    <section className="rounded-lg border border-szn-border bg-szn-card p-5" aria-labelledby="author-settings-byok">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-szn-accent" aria-hidden="true" />
            <h2 id="author-settings-byok" className="text-lg font-semibold text-szn-text-1">
              {copy.title}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-szn-text-2">{copy.description}</p>
        </div>
        <StatusBadge active={isActive} activeLabel={copy.active} missingLabel={copy.missing} />
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-szn-border bg-szn-bg p-3">
          <dt className="text-xs font-medium uppercase text-szn-text-3">{copy.status}</dt>
          <dd className="mt-1 text-sm font-semibold text-szn-text-1">
            {isActive ? copy.active : byok.status === "invalid" || byok.status === "error" ? copy.error : copy.missing}
          </dd>
        </div>
        <div className="rounded-md border border-szn-border bg-szn-bg p-3">
          <dt className="text-xs font-medium uppercase text-szn-text-3">{copy.lastFour}</dt>
          <dd className="mt-1 text-sm font-semibold text-szn-text-1">
            {byok.key_last_4 ? `•••• ${byok.key_last_4}` : "—"}
          </dd>
        </div>
        <div className="rounded-md border border-szn-border bg-szn-bg p-3">
          <dt className="text-xs font-medium uppercase text-szn-text-3">{copy.discount}</dt>
          <dd className="mt-1 text-sm font-semibold text-szn-text-1">
            {copy.discountStates[normalizedDiscountStatus]}
          </dd>
          {normalizedDiscountStatus === "error" && discountError ? (
            <p className="mt-1 text-xs text-red-600">{discountError}</p>
          ) : null}
        </div>
      </dl>

      <form onSubmit={handleSave} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-szn-text-1">
            {copy.keyLabel}
          </label>
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={copy.keyPlaceholder}
            className="mt-2 min-h-10 w-full rounded-md border border-szn-border bg-szn-bg px-3 text-sm text-szn-text-1 outline-none focus:border-szn-accent focus:ring-2 focus:ring-szn-accent/20"
          />
          <p className="mt-2 text-xs text-szn-text-3">{copy.keyHint}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            disabled={busy || !apiKey.trim()}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-szn-accent px-4 text-sm font-medium text-white hover:bg-szn-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {action === "saving" ? copy.saving : copy.save}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy || !isActive}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-szn-border px-4 text-sm font-medium text-szn-text-1 hover:bg-szn-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {action === "removing" ? copy.removing : copy.remove}
          </button>
        </div>
      </form>

      {message ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
          : "bg-szn-surface text-szn-text-2"
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
