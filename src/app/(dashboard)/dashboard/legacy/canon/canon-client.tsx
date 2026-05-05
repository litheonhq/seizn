"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CanonViolationRecord } from "@/lib/canon/enforce";
import type { CanonLock, CanonLockScope, CanonSeverity } from "@/lib/canon/validator";

const SCOPES: CanonLockScope[] = ["never_say", "always_say", "must_not_know", "must_know"];
const SEVERITIES: CanonSeverity[] = ["hard", "soft"];

function scopeLabel(scope: CanonLockScope) {
  return scope.replaceAll("_", " ");
}

function severityClass(severity: CanonSeverity) {
  return severity === "hard"
    ? "border-red-500/30 bg-red-500/10 text-red-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string | null) {
  if (!value) return "world";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-5)}` : value;
}

function lockStatusClass(active: boolean) {
  return active
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-szn-border-subtle bg-szn-surface-1 text-szn-text-3";
}

interface CanonClientProps {
  initialLocks: CanonLock[];
  initialViolations: CanonViolationRecord[];
  loadError?: string | null;
  live: boolean;
}

export function CanonClient({
  initialLocks,
  initialViolations,
  loadError = null,
  live,
}: CanonClientProps) {
  const [locks, setLocks] = useState(initialLocks);
  const [violations] = useState(initialViolations);
  const [message, setMessage] = useState<string | null>(loadError);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [npcId, setNpcId] = useState("");
  const [scope, setScope] = useState<CanonLockScope>("never_say");
  const [statement, setStatement] = useState("");
  const [regexFastpath, setRegexFastpath] = useState("");
  const [severity, setSeverity] = useState<CanonSeverity>("hard");
  const [isSaving, setIsSaving] = useState(false);

  const stats = useMemo(() => {
    return {
      active: locks.filter((lock) => lock.active).length,
      hard: locks.filter((lock) => lock.active && lock.severity === "hard").length,
      soft: locks.filter((lock) => lock.active && lock.severity === "soft").length,
      violations: violations.length,
    };
  }, [locks, violations]);

  function resetForm() {
    setEditingId(null);
    setNpcId("");
    setScope("never_say");
    setStatement("");
    setRegexFastpath("");
    setSeverity("hard");
  }

  function editLock(lock: CanonLock) {
    setEditingId(lock.id);
    setNpcId(lock.npcId || "");
    setScope(lock.scope);
    setStatement(lock.statement);
    setRegexFastpath(lock.regexFastpath || "");
    setSeverity(lock.severity);
    setMessage(null);
  }

  async function saveLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!live) {
      setMessage("Login required to edit canon locks.");
      return;
    }
    if (!statement.trim()) {
      setMessage("Statement is required.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/canon/locks/${encodeURIComponent(editingId)}` : "/api/canon/locks",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npcId: npcId.trim() || null,
            scope,
            statement: statement.trim(),
            regexFastpath: regexFastpath.trim() || null,
            severity,
            active: true,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to save canon lock");
      }

      const saved = payload.data.lock as CanonLock;
      setLocks((current) => {
        const withoutSaved = current.filter((lock) => lock.id !== saved.id);
        return [saved, ...withoutSaved].sort((a, b) => Number(b.active) - Number(a.active));
      });
      resetForm();
      setMessage("Canon lock saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save canon lock");
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateLock(lockId: string) {
    if (!live) {
      setMessage("Login required to edit canon locks.");
      return;
    }

    setMessage(null);
    try {
      const response = await fetch(`/api/canon/locks/${encodeURIComponent(lockId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to deactivate canon lock");
      }
      const updated = payload.data.lock as CanonLock;
      setLocks((current) => current.map((lock) => (lock.id === updated.id ? updated : lock)));
      if (editingId === lockId) resetForm();
      setMessage("Canon lock deactivated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to deactivate canon lock");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
        <div>
          <div className="szn-section-number mb-5">08 / CANON SAFETY</div>
          <h1 className="szn-serif text-5xl leading-none text-szn-text-1 sm:text-6xl">
            Canon Lock / 캐논 락
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.7] text-szn-text-2">
            Pin world facts and NPC boundaries before memories reach storage. Hard locks reject writes; soft locks keep the
            memory but leave an audit trail.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle sm:grid-cols-4">
          <Metric label="Active" value={stats.active} />
          <Metric label="Hard" value={stats.hard} />
          <Metric label="Soft" value={stats.soft} />
          <Metric label="Hits" value={stats.violations} />
        </div>
      </div>

      {message && (
        <div className="mb-6 border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="border border-szn-border-subtle bg-szn-surface-1">
          <div className="border-b border-szn-border-subtle px-5 py-4">
            <h2 className="text-lg font-semibold text-szn-text-1">Canon locks</h2>
            <p className="mt-1 text-sm text-szn-text-2">
              World-level locks apply to every NPC. NPC locks match `entity_id`, `companion_meta.npc_id`, or `agent_id`.
            </p>
          </div>

          {locks.length === 0 ? (
            <div className="p-5 text-sm text-szn-text-2">
              No canon locks yet. Start with a `never say` hard lock for one NPC.
            </div>
          ) : (
            <div className="divide-y divide-szn-border-subtle">
              {locks.map((lock) => (
                <article key={lock.id} className="grid gap-4 p-5 xl:grid-cols-[1fr_220px]">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex border px-2 py-1 text-xs font-medium ${lockStatusClass(lock.active)}`}>
                        {lock.active ? "active" : "inactive"}
                      </span>
                      <span className={`inline-flex border px-2 py-1 text-xs font-medium ${severityClass(lock.severity)}`}>
                        {lock.severity}
                      </span>
                      <span className="inline-flex border border-szn-border-subtle bg-szn-bg px-2 py-1 text-xs text-szn-text-2">
                        {scopeLabel(lock.scope)}
                      </span>
                      <span className="font-mono text-xs text-szn-text-3">{shortId(lock.npcId)}</span>
                    </div>
                    <p className="text-[15px] leading-[1.65] text-szn-text-1">{lock.statement}</p>
                    {lock.regexFastpath && (
                      <p className="mt-3 font-mono text-xs text-szn-text-3">/{lock.regexFastpath}/i</p>
                    )}
                  </div>

                  <div className="flex items-start justify-start gap-2 xl:justify-end">
                    <button type="button" onClick={() => editLock(lock)} className="szn-btn-ghost px-3 py-2 text-xs">
                      Edit
                    </button>
                    {lock.active && (
                      <button
                        type="button"
                        onClick={() => deactivateLock(lock.id)}
                        className="border border-szn-border-subtle px-3 py-2 text-xs text-szn-text-2 hover:border-red-500/40 hover:text-red-300"
                      >
                        Disable
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={saveLock} className="border border-szn-border-subtle bg-szn-surface-1 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-szn-text-1">
                {editingId ? "Edit lock" : "New lock"}
              </h2>
              <p className="mt-1 text-sm text-szn-text-2">새 캐논 규칙을 저장합니다.</p>
            </div>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-szn-text-3 hover:text-szn-text-1">
                Cancel
              </button>
            )}
          </div>

          <Field label="NPC ID">
            <input
              value={npcId}
              onChange={(event) => setNpcId(event.target.value)}
              placeholder="world-level if empty"
              className="mt-2 h-11 w-full border border-szn-border-subtle bg-szn-bg px-3 text-sm text-szn-text-1 outline-none placeholder:text-szn-text-3 focus:border-szn-signal"
            />
          </Field>

          <Field label="Scope">
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as CanonLockScope)}
              className="mt-2 h-11 w-full border border-szn-border-subtle bg-szn-bg px-3 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            >
              {SCOPES.map((item) => (
                <option key={item} value={item}>{scopeLabel(item)}</option>
              ))}
            </select>
          </Field>

          <Field label="Severity">
            <div className="mt-2 grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle">
              {SEVERITIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSeverity(item)}
                  className={`h-10 bg-szn-bg text-sm ${severity === item ? "text-szn-signal" : "text-szn-text-2"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Statement">
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder="Kaelan never mentions Gretel by name."
              rows={5}
              className="mt-2 w-full resize-none border border-szn-border-subtle bg-szn-bg px-3 py-3 text-sm leading-6 text-szn-text-1 outline-none placeholder:text-szn-text-3 focus:border-szn-signal"
              required
            />
          </Field>

          <Field label="Regex fast-path">
            <input
              value={regexFastpath}
              onChange={(event) => setRegexFastpath(event.target.value)}
              placeholder="Gretel|Third War"
              className="mt-2 h-11 w-full border border-szn-border-subtle bg-szn-bg px-3 font-mono text-sm text-szn-text-1 outline-none placeholder:text-szn-text-3 focus:border-szn-signal"
            />
          </Field>

          <button type="submit" disabled={isSaving} className="szn-btn-signal mt-6 w-full disabled:opacity-50">
            {isSaving ? "Saving..." : editingId ? "Save changes" : "Create lock"}
          </button>
        </form>
      </div>

      <section className="mt-6 border border-szn-border-subtle bg-szn-surface-1">
        <div className="border-b border-szn-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-szn-text-1">Violation log</h2>
          <p className="mt-1 text-sm text-szn-text-2">Hard and soft canon hits from memory writes.</p>
        </div>
        {violations.length === 0 ? (
          <div className="p-5 text-sm text-szn-text-2">No canon violations recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-szn-border-subtle">
              <thead className="bg-szn-bg">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Attempt</th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Lock</th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">NPC</th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border-subtle">
                {violations.map((violation) => (
                  <tr key={violation.id} className="align-top">
                    <td className="max-w-xl px-5 py-4">
                      <p className="truncate text-sm text-szn-text-1">{violation.attemptedContent}</p>
                      <p className="mt-2 font-mono text-xs text-szn-text-3">
                        {typeof violation.verdict === "object" && "reason" in violation.verdict
                          ? String(violation.verdict.reason || "canon_violation")
                          : "canon_violation"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex border px-2 py-1 text-xs font-medium ${severityClass(violation.severity)}`}>
                        {violation.severity}
                      </span>
                      <p className="mt-2 max-w-xs truncate text-xs text-szn-text-2">
                        {violation.lock?.statement || shortId(violation.lockId)}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-szn-text-2">{shortId(violation.npcId)}</td>
                    <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(violation.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-szn-bg p-4">
      <div className="szn-eyebrow mb-2">{label}</div>
      <div className="font-mono text-2xl tabular-nums text-szn-text-1">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="szn-eyebrow">{label}</span>
      {children}
    </label>
  );
}
