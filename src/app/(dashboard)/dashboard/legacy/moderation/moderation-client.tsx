"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ModerationCategory,
  ModerationDecision,
  ModerationStatus,
} from "@/lib/moderation/guard";

type Category = ModerationCategory;
type Action = "block" | "redact" | "flag";

interface ModerationPolicy {
  organizationId: string;
  policyName: string;
  memoryClass: string | null;
  category: Category;
  action: Action;
  threshold: number;
}

const CATEGORIES: Category[] = ["sexual", "violence", "pii", "hate", "self_harm", "csam"];
const ACTIONS: Action[] = ["block", "redact", "flag"];

const DEMO_POLICIES: ModerationPolicy[] = [
  {
    organizationId: "review",
    policyName: "default",
    memoryClass: null,
    category: "csam",
    action: "block",
    threshold: 0.01,
  },
  {
    organizationId: "review",
    policyName: "default",
    memoryClass: null,
    category: "pii",
    action: "redact",
    threshold: 0.5,
  },
  {
    organizationId: "review",
    policyName: "default",
    memoryClass: null,
    category: "sexual",
    action: "flag",
    threshold: 0.8,
  },
];

interface ModerationClientProps {
  initialDecisions?: ModerationDecision[];
  decisionLoadError?: string | null;
}

function formatCategory(category: Category) {
  return category.replace("_", " ");
}

function actionClass(action: Action) {
  if (action === "block") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (action === "redact") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function statusClass(status: ModerationStatus) {
  if (status === "blocked") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "redacted") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "flagged") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-szn-border-subtle bg-szn-surface-1 text-szn-text-2";
}

function topCategory(scores: ModerationDecision["scores"]): { category: Category; score: number } {
  return CATEGORIES.reduce(
    (best, category) => {
      const score = scores[category] || 0;
      return score > best.score ? { category, score } : best;
    },
    { category: "pii" as Category, score: 0 }
  );
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function DecisionTable({
  decisions,
  loadError,
}: {
  decisions: ModerationDecision[];
  loadError?: string | null;
}) {
  if (loadError) {
    return (
      <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-5">
        <div className="szn-eyebrow mb-2 text-amber-200">Migration pending</div>
        <p className="text-sm text-amber-100">
          Moderation decision columns are not readable from this environment yet.
        </p>
        <p className="mt-3 font-mono text-xs text-amber-200/80">{loadError}</p>
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-szn-border-subtle p-5 text-sm text-szn-text-2">
        No moderated memories yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-szn-border-subtle">
      <table className="min-w-full divide-y divide-szn-border-subtle">
        <thead className="bg-szn-bg">
          <tr>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Memory</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Decision</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Top score</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Class</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border-subtle">
          {decisions.map((decision) => {
            const top = topCategory(decision.scores);
            return (
              <tr key={decision.id} className="align-top">
                <td className="px-5 py-4">
                  <div className="max-w-lg truncate text-sm text-szn-text-1">
                    {decision.content || "[redacted or blocked]"}
                  </div>
                  <div className="mt-2 font-mono text-xs text-szn-text-3">{shortId(decision.id)}</div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass(decision.status)}`}>
                    {decision.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="font-mono text-sm text-szn-text-1">{Math.round(top.score * 100)}%</div>
                  <div className="mt-1 text-xs text-szn-text-2">{formatCategory(top.category)}</div>
                </td>
                <td className="px-5 py-4 text-sm text-szn-text-2">
                  {decision.memoryClass || decision.memoryType || "default"}
                </td>
                <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(decision.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ModerationClient({ initialDecisions = [], decisionLoadError = null }: ModerationClientProps) {
  const [policies, setPolicies] = useState<ModerationPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [policyName, setPolicyName] = useState("default");
  const [memoryClass, setMemoryClass] = useState("");
  const [category, setCategory] = useState<Category>("pii");
  const [action, setAction] = useState<Action>("redact");
  const [threshold, setThreshold] = useState("0.5");

  const grouped = useMemo(() => {
    return policies.reduce<Record<string, ModerationPolicy[]>>((acc, policy) => {
      const key = `${policy.policyName}:${policy.memoryClass || "all"}`;
      acc[key] ||= [];
      acc[key].push(policy);
      return acc;
    }, {});
  }, [policies]);

  const decisionStats = useMemo(() => {
    return initialDecisions.reduce<Record<ModerationStatus, number>>(
      (acc, decision) => {
        acc[decision.status] += 1;
        return acc;
      },
      { clean: 0, flagged: 0, redacted: 0, blocked: 0 }
    );
  }, [initialDecisions]);

  useEffect(() => {
    let alive = true;

    async function loadPolicies() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/moderation-policies", { cache: "no-store" });
        if (!response.ok) throw new Error("moderation policies unavailable");
        const payload = await response.json();
        if (!alive) return;
        setPolicies(payload.data?.policies || []);
        setFeatureEnabled(Boolean(payload.data?.featureEnabled));
        setProvider(payload.data?.provider || "openai");
      } catch {
        if (!alive) return;
        setPolicies(DEMO_POLICIES);
        setFeatureEnabled(false);
        setProvider("openai");
        setMessage("Live policies unavailable. Showing the default moderation policy shape.");
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    loadPolicies();
    return () => {
      alive = false;
    };
  }, []);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const parsedThreshold = Number(threshold);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      setMessage("Threshold must be between 0 and 1.");
      return;
    }

    try {
      const response = await fetch(`/api/v1/moderation-policies/${encodeURIComponent(policyName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryClass: memoryClass.trim() || null,
          category,
          action,
          threshold: parsedThreshold,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "Failed to save policy");
      }
      const saved = payload.data?.policies || [];
      setPolicies((current) => {
        const next = current.filter((policy) => {
          return !saved.some((item: ModerationPolicy) => (
            item.policyName === policy.policyName &&
            item.category === policy.category &&
            (item.memoryClass || null) === (policy.memoryClass || null)
          ));
        });
        return [...next, ...saved].sort((a, b) => a.policyName.localeCompare(b.policyName));
      });
      setMessage("Policy saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save policy");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="szn-section-number mb-5">07 / MEMORY SAFETY</div>
          <h1 className="szn-serif text-[clamp(36px,4.4vw,64px)] text-szn-text-1 leading-[1.02] tracking-[-0.025em]">
            Moderation policies
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-[1.6] text-szn-text-2">
            Control which memories are blocked, redacted, or flagged before storage and before recall.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-szn-border-subtle border border-szn-border-subtle">
          <div className="bg-szn-bg p-4">
            <div className="szn-eyebrow mb-2">FEATURE FLAG</div>
            <p className="font-mono text-[18px] tabular-nums text-szn-text-1">
              {featureEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="bg-szn-bg p-4">
            <div className="szn-eyebrow mb-2">PROVIDER</div>
            <p className="font-mono text-[18px] tabular-nums text-szn-text-1">{provider}</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-szn-border-subtle bg-szn-surface-1">
          <div className="border-b border-szn-border-subtle px-5 py-4">
            <h2 className="text-lg font-semibold text-szn-text-1">Active rules</h2>
            <p className="mt-1 text-sm text-szn-text-2">
              Class-specific rules override the global class for the same policy name.
            </p>
          </div>
          <div className="divide-y divide-szn-border">
            {isLoading ? (
              <div className="p-5 text-sm text-szn-text-2">Loading moderation policies...</div>
            ) : Object.entries(grouped).length === 0 ? (
              <div className="p-5 text-sm text-szn-text-2">No policies configured.</div>
            ) : (
              Object.entries(grouped).map(([key, rows]) => {
                const [name, klass] = key.split(":");
                return (
                  <div key={key} className="p-5">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold text-szn-text-1">{name}</h3>
                      <span className="rounded-md border border-szn-border-subtle px-2 py-1 text-xs text-szn-text-2">
                        {klass === "all" ? "all memory classes" : klass}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {rows.map((policy) => (
                        <div
                          key={`${policy.policyName}-${policy.memoryClass || "all"}-${policy.category}`}
                          className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium capitalize text-szn-text-1">
                                {formatCategory(policy.category)}
                              </p>
                              <p className="mt-1 text-xs text-szn-text-2">
                                Threshold {policy.threshold.toFixed(2)}
                              </p>
                            </div>
                            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${actionClass(policy.action)}`}>
                              {policy.action}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <form onSubmit={savePolicy} className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-5">
          <h2 className="text-lg font-semibold text-szn-text-1">Edit a rule</h2>
          <p className="mt-1 text-sm text-szn-text-2">
            Use one category per rule. Leave memory class empty to apply it globally.
          </p>

          <label className="mt-5 block text-sm font-medium text-szn-text-1">
            Policy name
            <input aria-label="Policy Name"
              value={policyName}
              onChange={(event) => setPolicyName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
              required
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-szn-text-1">
            Memory class
            <input aria-label="Memory Class"
              value={memoryClass}
              onChange={(event) => setMemoryClass(event.target.value)}
              placeholder="fact, preference, quest, npc"
              className="mt-2 w-full rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-szn-text-1">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
              className="mt-2 w-full rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>{formatCategory(item)}</option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-sm font-medium text-szn-text-1">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value as Action)}
              className="mt-2 w-full rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
            >
              {ACTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-sm font-medium text-szn-text-1">
            Threshold
            <input aria-label="Threshold"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              inputMode="decimal"
              className="mt-2 w-full rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1 outline-none focus:border-szn-signal"
              required
            />
          </label>

          <button
            type="submit"
            className="mt-6 w-full rounded-md bg-szn-signal px-4 py-2 text-sm font-medium text-szn-signal-fg transition-colors hover:bg-szn-signal-hover"
          >
            Save rule
          </button>
        </form>
      </div>

      <section className="mt-6 rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-szn-text-1">Recent decisions</h2>
            <p className="mt-1 text-sm text-szn-text-2">
              Memories that triggered block, redact, or flag actions.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px border border-szn-border-subtle bg-szn-border-subtle">
            {(["blocked", "redacted", "flagged"] as ModerationStatus[]).map((status) => (
              <div key={status} className="bg-szn-bg px-4 py-3">
                <div className="szn-eyebrow mb-2">{status}</div>
                <div className="font-mono text-[20px] text-szn-text-1">{decisionStats[status]}</div>
              </div>
            ))}
          </div>
        </div>
        <DecisionTable decisions={initialDecisions} loadError={decisionLoadError} />
      </section>
    </div>
  );
}
