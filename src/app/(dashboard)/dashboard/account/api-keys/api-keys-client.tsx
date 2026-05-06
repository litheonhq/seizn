"use client";

import Link from "next/link";
import { useReducer, useTransition, type FormEvent } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { useToast } from "@/contexts/ToastContext";
import type { UserUsageSummary } from "@/lib/api-keys";
import {
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from "./actions";
import type { ApiKeySummary } from "./page";
import { UsageSummary } from "./usage-summary";

type DialogState =
  | { kind: "closed" }
  | { kind: "creating" }
  | { kind: "secret-revealed"; key: string; prefix: string; mode: "created" | "rotated" }
  | { kind: "confirm-revoke"; id: string; name: string }
  | { kind: "confirm-rotate"; id: string; name: string };

type State = {
  keys: ApiKeySummary[];
  dialog: DialogState;
  draftName: string;
};

type Action =
  | { type: "open-create" }
  | { type: "close-dialog" }
  | { type: "set-draft-name"; value: string }
  | { type: "show-secret"; key: string; prefix: string; mode: "created" | "rotated" }
  | { type: "open-confirm-revoke"; id: string; name: string }
  | { type: "open-confirm-rotate"; id: string; name: string }
  | { type: "add-key"; entry: ApiKeySummary }
  | { type: "remove-key"; id: string }
  | { type: "replace-key"; oldId: string; entry: ApiKeySummary };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "open-create":
      return { ...state, dialog: { kind: "creating" }, draftName: "" };
    case "close-dialog":
      return { ...state, dialog: { kind: "closed" }, draftName: "" };
    case "set-draft-name":
      return { ...state, draftName: action.value };
    case "show-secret":
      return {
        ...state,
        dialog: {
          kind: "secret-revealed",
          key: action.key,
          prefix: action.prefix,
          mode: action.mode,
        },
        draftName: "",
      };
    case "open-confirm-revoke":
      return {
        ...state,
        dialog: { kind: "confirm-revoke", id: action.id, name: action.name },
      };
    case "open-confirm-rotate":
      return {
        ...state,
        dialog: { kind: "confirm-rotate", id: action.id, name: action.name },
      };
    case "add-key":
      return { ...state, keys: [action.entry, ...state.keys] };
    case "remove-key":
      return { ...state, keys: state.keys.filter((entry) => entry.id !== action.id) };
    case "replace-key":
      return {
        ...state,
        keys: state.keys.map((entry) =>
          entry.id === action.oldId ? action.entry : entry,
        ),
      };
    default:
      return state;
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function ApiKeysClient({
  initialKeys,
  cap,
  initialUsage = null,
}: {
  initialKeys: ApiKeySummary[];
  cap: number;
  initialUsage?: UserUsageSummary | null;
}) {
  const { t } = useDashboardTranslation();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, {
    keys: initialKeys,
    dialog: { kind: "closed" } as DialogState,
    draftName: "",
  });
  const [isPending, startTransition] = useTransition();

  const remaining = Math.max(0, cap - state.keys.length);
  const atCap = remaining === 0;

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = state.draftName.trim();
    if (!name) {
      return;
    }
    startTransition(async () => {
      const result = await createApiKey({ name });
      if (!result.ok) {
        toast(
          "error",
          result.code === "cap_reached"
            ? t("dashboard.account.apiKeys.errors.capReached")
            : result.code === "invalid_name"
              ? t("dashboard.account.apiKeys.errors.invalidName")
              : t("dashboard.account.apiKeys.errors.internal"),
        );
        return;
      }
      dispatch({
        type: "add-key",
        entry: {
          id: result.id,
          name: result.name,
          prefix: result.prefix,
          scopes: result.scopes,
          monthlyQuota: 100,
          monthlyQuotaPeriod: "day",
          rateLimitPerMinute: 30,
          used: 0,
          createdAt: result.createdAt,
          lastUsedAt: null,
        },
      });
      dispatch({ type: "show-secret", key: result.key, prefix: result.prefix, mode: "created" });
    });
  };

  const onRevoke = (id: string) => {
    startTransition(async () => {
      const result = await revokeApiKey(id);
      if (!result.ok) {
        toast("error", t("dashboard.account.apiKeys.errors.revokeFailed"));
        return;
      }
      dispatch({ type: "remove-key", id });
      dispatch({ type: "close-dialog" });
      toast("success", t("dashboard.account.apiKeys.toasts.revoked"));
    });
  };

  const onRotate = (id: string) => {
    const original = state.keys.find((entry) => entry.id === id);
    startTransition(async () => {
      const result = await rotateApiKey(id);
      if (!result.ok) {
        toast("error", t("dashboard.account.apiKeys.errors.rotateFailed"));
        return;
      }
      if (original) {
        dispatch({
          type: "replace-key",
          oldId: id,
          entry: { ...original, id: result.id, prefix: result.prefix, used: 0 },
        });
      }
      dispatch({
        type: "show-secret",
        key: result.key,
        prefix: result.prefix,
        mode: "rotated",
      });
    });
  };

  const onCopySecret = (key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(key).then(
        () => toast("success", t("dashboard.account.apiKeys.toasts.copied")),
        () => toast("error", t("dashboard.account.apiKeys.errors.copyFailed")),
      );
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10 text-ink">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl">{t("dashboard.account.apiKeys.title")}</h1>
        <p className="text-sm text-ink/70">
          {t("dashboard.account.apiKeys.description")}
        </p>
        <p className="text-xs text-ink/50">
          {t("dashboard.account.apiKeys.capHint").replace("{cap}", String(cap))}
        </p>
      </header>

      <div className="mt-8">
        <UsageSummary usage={initialUsage} keys={state.keys} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-ink/70">
          {state.keys.length} / {cap}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/account/api-keys/audit"
            className="text-sm text-terracotta underline"
          >
            {t("dashboard.account.apiKeys.audit.link")}
          </Link>
          <button
            type="button"
            disabled={atCap || isPending}
            onClick={() => dispatch({ type: "open-create" })}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
          >
            {t("dashboard.account.apiKeys.newKey")}
          </button>
        </div>
      </div>

      {state.keys.length === 0 ? (
        <p className="mt-12 rounded-md border border-dashed border-ink/30 p-8 text-center text-sm text-ink/60">
          {t("dashboard.account.apiKeys.empty")}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-ink/10 rounded-md border border-ink/10">
          {state.keys.map((entry) => {
            const usagePct = entry.monthlyQuota
              ? Math.min(100, Math.round((entry.used / entry.monthlyQuota) * 100))
              : 0;
            return (
              <li key={entry.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.name}</span>
                    <code className="rounded bg-ink/5 px-2 py-0.5 text-xs">{entry.prefix}…</code>
                  </div>
                  <div className="text-xs text-ink/60">
                    {t("dashboard.account.apiKeys.scopes")}: {entry.scopes.join(", ") || "—"}
                  </div>
                  <div className="text-xs text-ink/60">
                    {t("dashboard.account.apiKeys.usage")}: {entry.used} / {entry.monthlyQuota} ({usagePct}%) ·{" "}
                    {t("dashboard.account.apiKeys.rateLimit")}: {entry.rateLimitPerMinute}/min
                  </div>
                  <div className="text-xs text-ink/40">
                    {t("dashboard.account.apiKeys.lastUsed")}: {formatTimestamp(entry.lastUsedAt)} ·{" "}
                    {t("dashboard.account.apiKeys.createdAt")}: {formatTimestamp(entry.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => dispatch({ type: "open-confirm-rotate", id: entry.id, name: entry.name })}
                    className="rounded-md border border-ink/20 px-3 py-1.5 text-xs"
                  >
                    {t("dashboard.account.apiKeys.rotate")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => dispatch({ type: "open-confirm-revoke", id: entry.id, name: entry.name })}
                    className="rounded-md border border-terracotta/40 px-3 py-1.5 text-xs text-terracotta"
                  >
                    {t("dashboard.account.apiKeys.revoke")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.dialog.kind === "creating" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40">
          <form
            onSubmit={onCreate}
            className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl"
          >
            <h2 className="font-serif text-xl">{t("dashboard.account.apiKeys.newKey")}</h2>
            <label className="mt-4 block text-sm text-ink/80">
              {t("dashboard.account.apiKeys.name")}
              <input
                type="text"
                value={state.draftName}
                onChange={(event) => dispatch({ type: "set-draft-name", value: event.target.value })}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2"
                maxLength={80}
                required
              />
            </label>
            <p className="mt-2 text-xs text-ink/50">
              {t("dashboard.account.apiKeys.scopesDefault")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => dispatch({ type: "close-dialog" })}
                className="rounded-md px-4 py-2 text-sm"
              >
                {t("dashboard.account.apiKeys.cancel")}
              </button>
              <button
                type="submit"
                disabled={isPending || !state.draftName.trim()}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
              >
                {t("dashboard.account.apiKeys.create")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {state.dialog.kind === "secret-revealed" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40">
          <div className="w-full max-w-lg rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="font-serif text-xl">
              {state.dialog.mode === "rotated"
                ? t("dashboard.account.apiKeys.rotated")
                : t("dashboard.account.apiKeys.created")}
            </h2>
            <p className="mt-2 text-sm text-terracotta">
              {t("dashboard.account.apiKeys.saveItNow")}
            </p>
            <code className="mt-4 block break-all rounded bg-ink/5 p-3 text-xs">
              {state.dialog.key}
            </code>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => onCopySecret(state.dialog.kind === "secret-revealed" ? state.dialog.key : "")}
                className="rounded-md border border-ink/20 px-4 py-2 text-sm"
              >
                {t("dashboard.account.apiKeys.copyKey")}
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "close-dialog" })}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream"
              >
                {t("dashboard.account.apiKeys.done")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.dialog.kind === "confirm-revoke" ? (
        <ConfirmDialog
          title={t("dashboard.account.apiKeys.revokeTitle")}
          body={t("dashboard.account.apiKeys.revokeBody").replace("{name}", state.dialog.name)}
          confirmLabel={t("dashboard.account.apiKeys.revoke")}
          confirmVariant="danger"
          isPending={isPending}
          onCancel={() => dispatch({ type: "close-dialog" })}
          onConfirm={() => onRevoke(state.dialog.kind === "confirm-revoke" ? state.dialog.id : "")}
        />
      ) : null}

      {state.dialog.kind === "confirm-rotate" ? (
        <ConfirmDialog
          title={t("dashboard.account.apiKeys.rotateTitle")}
          body={t("dashboard.account.apiKeys.rotateBody").replace("{name}", state.dialog.name)}
          confirmLabel={t("dashboard.account.apiKeys.rotate")}
          confirmVariant="primary"
          isPending={isPending}
          onCancel={() => dispatch({ type: "close-dialog" })}
          onConfirm={() => onRotate(state.dialog.kind === "confirm-rotate" ? state.dialog.id : "")}
        />
      ) : null}
    </section>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmVariant,
  isPending,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmVariant: "primary" | "danger";
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="mt-2 text-sm text-ink/70">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={
              confirmVariant === "danger"
                ? "rounded-md bg-terracotta px-4 py-2 text-sm text-cream disabled:opacity-50"
                : "rounded-md bg-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
