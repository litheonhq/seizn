"use client";

import { useMemo, useState } from "react";

type Verdict = "canon" | "conflict" | "pending";

interface PromptCase {
  label: string;
  text: string;
  verdict: Verdict;
  rule: string;
  explain: string;
}

export const DETECTOR_SEED = "Mira transfers to Class 2 on day 9.";

const PROMPTS: PromptCase[] = [
  {
    label: DETECTOR_SEED,
    text: DETECTOR_SEED,
    verdict: "conflict",
    rule: "character.mira.class = 1",
    explain:
      "Canon registers Mira in Class 1 from day 1. A transfer event on day 9 needs a new rule or this fact reverts.",
  },
  {
    label: "Mira has gray eyes.",
    text: "Mira has gray eyes.",
    verdict: "conflict",
    rule: "character.mira.eye_color = brown",
    explain: "Canon establishes Mira with brown eyes. The proposed fact contradicts the ledger.",
  },
  {
    label: "The eclipse happens on day 23.",
    text: "The eclipse happens on day 23.",
    verdict: "canon",
    rule: "rule.r02",
    explain: "Matches established rule r02. No further review needed.",
  },
  {
    label: "Sasha and Mira argue at the observatory.",
    text: "Sasha and Mira argue at the observatory.",
    verdict: "pending",
    rule: "scene.new",
    explain: "New scene fact. No conflicts detected. Author review queued.",
  },
];

function pickVerdict(text: string): PromptCase | null {
  const value = text.toLowerCase().trim();
  if (!value) return null;

  for (const prompt of PROMPTS) {
    if (value === prompt.text.toLowerCase()) return prompt;
  }

  if (/(gray|grey|blue|green) eyes?/.test(value) && /mira/.test(value)) {
    return PROMPTS[1];
  }
  if (/class 2|transfer/.test(value) && /mira/.test(value)) {
    return PROMPTS[0];
  }
  if (/eclipse/.test(value) && /day 23/.test(value)) {
    return PROMPTS[2];
  }

  return {
    label: text,
    text,
    verdict: "pending",
    rule: "scene.new",
    explain: "New fact. No direct conflicts found. Queued for author review.",
  };
}

export function ConflictDetector({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState(DETECTOR_SEED);
  const [history, setHistory] = useState<PromptCase[]>([PROMPTS[2]]);
  const result = useMemo(() => pickVerdict(text), [text]);

  function commit() {
    if (!result || !text.trim()) return;
    setHistory((items) => [{ ...result, text }, ...items].slice(0, 4));
    setText("");
  }

  return (
    <div
      className="w-full overflow-hidden rounded-[var(--radius-lg)] border"
      data-testid="conflict-detector"
      style={{ maxWidth: 560, background: "var(--ink-0)", borderColor: "var(--ink-100)", boxShadow: "var(--shadow-lg)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--signal-canon)", boxShadow: "0 0 0 4px oklch(0.62 0.16 148 / 0.16)" }} />
          <span className="author-mono text-xs" style={{ color: "var(--ink-700)" }}>
            canon ledger / saebyeok.demo
          </span>
        </div>
        <span className="author-badge" style={{ background: "var(--ink-100)", color: "var(--ink-700)" }}>
          read-only synthetic demo data
        </span>
      </div>

      <div className={compact ? "p-4" : "p-5"}>
        <label className="author-eyebrow mb-2 block" htmlFor="author-conflict-input">
          propose a fact
        </label>
        <p id="author-conflict-help" className="sr-only">
          Reconciles every fact against the sample character, rule, and timeline ledger.
        </p>
        <textarea
          id="author-conflict-input"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          rows={compact ? 2 : 3}
          aria-describedby="author-conflict-result author-conflict-help"
          className="w-full resize-none rounded-[var(--radius-md)] border px-3.5 py-3 text-[15px] leading-6 outline-none transition-shadow"
          style={{ borderColor: "var(--ink-200)", background: "var(--ink-0)", color: "var(--ink-900)" }}
          placeholder="e.g. Mira has gray eyes."
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="author-eyebrow mr-1">try</span>
          {PROMPTS.slice(0, compact ? 3 : 4).map((prompt) => (
            <button
              key={prompt.text}
              type="button"
              onClick={() => setText(prompt.text)}
              className="min-h-11 rounded-full border px-3 text-left text-[12px]"
              style={{ borderColor: "var(--ink-200)", background: "var(--ink-50)", color: "var(--ink-600)", fontFamily: "var(--font-mono)" }}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="author-conflict-result"
        role="status"
        aria-live="polite"
        className="mx-4 rounded-[var(--radius-md)] border p-4"
        style={{
          minHeight: 88,
          background:
            result?.verdict === "conflict"
              ? "var(--signal-conflict-soft)"
              : result?.verdict === "canon"
                ? "var(--signal-canon-soft)"
                : result?.verdict === "pending"
                  ? "var(--signal-pending-soft)"
                  : "var(--ink-50)",
          borderColor:
            result?.verdict === "conflict"
              ? "oklch(0.85 0.10 27)"
              : result?.verdict === "canon"
                ? "oklch(0.85 0.10 148)"
                : result?.verdict === "pending"
                  ? "oklch(0.88 0.10 85)"
                  : "var(--ink-100)",
        }}
      >
        {result ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VerdictPill verdict={result.verdict} />
              <span className="author-mono text-[11px]" style={{ color: "var(--ink-500)" }}>
                {result.rule}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-800)" }}>
              {result.explain}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={commit}
                className="author-btn min-h-11 px-3 text-[13px]"
                style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}
              >
                {result.verdict === "conflict" ? "log conflict" : result.verdict === "canon" ? "accept" : "queue review"}
              </button>
              <button
                type="button"
                onClick={() => setText("")}
                className="author-btn min-h-11 border px-3 text-[13px]"
                style={{ borderColor: "var(--ink-200)", color: "var(--ink-800)" }}
              >
                discard
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm leading-6" style={{ color: "var(--ink-500)" }}>
            Reconciles every fact against 8 characters, 22 rules, and a 30 day timeline.
          </p>
        )}
      </div>

      <div className="p-4">
        <p className="author-eyebrow mb-2">recent / {history.length}</p>
        <div className="grid gap-1.5">
          {history.map((item, index) => (
            <div key={`${item.text}-${index}`} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-sm" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
              <VerdictDot verdict={item.verdict} />
              <span className="flex-1 truncate" style={{ color: "var(--ink-800)" }}>
                {item.text}
              </span>
              <span className="author-mono text-[10px]" style={{ color: "var(--ink-500)" }}>
                {item.rule}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const style =
    verdict === "canon"
      ? { background: "var(--signal-canon-soft)", color: "var(--signal-canon-ink)" }
      : verdict === "conflict"
        ? { background: "var(--signal-conflict-soft)", color: "var(--signal-conflict-ink)" }
        : { background: "var(--signal-pending-soft)", color: "var(--signal-pending-ink)" };
  const label = verdict === "canon" ? "canon validated" : verdict === "conflict" ? "conflict" : "pending review";

  return (
    <span className="author-badge" style={style}>
      <span className="author-badge-dot" />
      {label}
    </span>
  );
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const color = verdict === "canon" ? "var(--signal-canon)" : verdict === "conflict" ? "var(--signal-conflict)" : "var(--signal-pending)";
  return <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />;
}
