"use client";

import Link from "next/link";
import { useMemo, useReducer } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import type { AuditEntry } from "./page";

const ACTION_FILTERS = [
  "all",
  "created",
  "revoked",
  "rotated",
  "rate_limited",
  "quota_exceeded",
  "scope_denied",
] as const;
type ActionFilter = (typeof ACTION_FILTERS)[number];

type State = {
  action: ActionFilter;
  from: string;
  to: string;
};

type Action =
  | { type: "set-action"; value: ActionFilter }
  | { type: "set-from"; value: string }
  | { type: "set-to"; value: string }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-action":
      return { ...state, action: action.value };
    case "set-from":
      return { ...state, from: action.value };
    case "set-to":
      return { ...state, to: action.value };
    case "reset":
      return { action: "all", from: "", to: "" };
    default:
      return state;
  }
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function downloadCsv(rows: AuditEntry[]): void {
  if (typeof window === "undefined") return;
  const header = "occurred_at,action,api_key_id,metadata\n";
  const body = rows
    .map((row) =>
      [
        csvField(row.occurredAt),
        csvField(row.action),
        csvField(row.apiKeyId ?? ""),
        csvField(JSON.stringify(row.metadata ?? {})),
      ].join(","),
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seizn-api-keys-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AuditClient({ entries }: { entries: AuditEntry[] }) {
  const { t } = useDashboardTranslation();
  const [state, dispatch] = useReducer(reducer, {
    action: "all" as ActionFilter,
    from: "",
    to: "",
  });

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (state.action !== "all" && entry.action !== state.action) return false;
      if (state.from && entry.occurredAt < state.from) return false;
      if (state.to && entry.occurredAt > state.to) return false;
      return true;
    });
  }, [entries, state]);

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10 text-szn-text-1">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">{t("dashboard.account.apiKeys.audit.title")}</h1>
          <p className="mt-1 text-sm text-szn-text-2">
            {t("dashboard.account.apiKeys.audit.description")}
          </p>
        </div>
        <Link
          href="/dashboard/account/api-keys"
          className="text-sm text-szn-signal underline"
        >
          ← {t("dashboard.account.apiKeys.title")}
        </Link>
      </header>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-szn-text-2">
          {t("dashboard.account.apiKeys.audit.filterAction")}
          <select
            value={state.action}
            onChange={(event) =>
              dispatch({ type: "set-action", value: event.target.value as ActionFilter })
            }
            className="mt-1 rounded-md border border-szn-border bg-szn-surface px-3 py-1.5 text-sm text-szn-text-1"
          >
            {ACTION_FILTERS.map((option) => (
              <option key={option} value={option}>
                {t(`dashboard.account.apiKeys.audit.action.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-szn-text-2">
          {t("dashboard.account.apiKeys.audit.from")}
          <input
            id="track2-api-key-audit-from"
            type="date"
            value={state.from}
            onChange={(event) => dispatch({ type: "set-from", value: event.target.value })}
            className="mt-1 rounded-md border border-szn-border bg-szn-surface px-3 py-1.5 text-sm text-szn-text-1"
          />
        </label>
        <label className="flex flex-col text-xs text-szn-text-2">
          {t("dashboard.account.apiKeys.audit.to")}
          <input
            id="track2-api-key-audit-to"
            type="date"
            value={state.to}
            onChange={(event) => dispatch({ type: "set-to", value: event.target.value })}
            className="mt-1 rounded-md border border-szn-border bg-szn-surface px-3 py-1.5 text-sm text-szn-text-1"
          />
        </label>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset" })}
          className="rounded-md border border-szn-border px-3 py-1.5 text-sm"
        >
          {t("dashboard.account.apiKeys.audit.reset")}
        </button>
        <button
          type="button"
          onClick={() => downloadCsv(filtered)}
          className="ml-auto rounded-md bg-szn-text-1 px-4 py-1.5 text-sm text-white"
        >
          {t("dashboard.account.apiKeys.audit.exportCsv")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-12 rounded-md border border-dashed border-szn-border p-8 text-center text-sm text-szn-text-2">
          {t("dashboard.account.apiKeys.audit.empty")}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-szn-border-subtle rounded-md border border-szn-border-subtle">
          {filtered.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {t(`dashboard.account.apiKeys.audit.action.${entry.action}`)}
                </span>
                <time className="text-xs text-szn-text-2">{new Date(entry.occurredAt).toLocaleString()}</time>
              </div>
              <code className="text-xs text-szn-text-2">
                {entry.apiKeyId ?? "—"}
              </code>
              {Object.keys(entry.metadata).length > 0 ? (
                <pre className="mt-1 whitespace-pre-wrap rounded bg-szn-surface p-2 text-[11px]">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
