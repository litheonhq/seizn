"use client";

import { useState } from "react";
import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

type ModeId = AuthorLandingCopy["inputs"]["modes"][number]["id"];

export function SectionInputs({ copy }: { copy: AuthorLandingCopy }) {
  const [active, setActive] = useState<ModeId>("docx");
  const mode = copy.inputs.modes.find((item) => item.id === active) ?? copy.inputs.modes[0];

  return (
    <section className="author-section" style={{ background: "var(--ink-50)" }}>
      <div className="author-shell">
        <SectionHeader eyebrow={copy.inputs.eyebrow} title={copy.inputs.title} subtitle={copy.inputs.subtitle} align="left" />
        <div className="mt-12 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12" data-testid="input-modes">
          <div className="grid gap-2">
            {copy.inputs.modes.map((item) => {
              const selected = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className="flex min-h-[76px] items-start gap-4 rounded-[var(--radius-md)] border p-4 text-left transition-colors"
                  style={{
                    borderColor: selected ? "var(--ink-200)" : "transparent",
                    background: selected ? "var(--ink-0)" : "transparent",
                    boxShadow: selected ? "var(--shadow-sm)" : "none",
                  }}
                >
                  <ModeGlyph kind={item.id} active={selected} />
                  <span className="flex-1">
                    <span className="block text-base font-medium" style={{ color: selected ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {item.name}
                    </span>
                    <span className="author-mono mt-1 block text-[11px]" style={{ color: "var(--ink-500)" }}>
                      {item.subtitle}
                    </span>
                  </span>
                  <span className="mt-2 h-1.5 w-1.5 rounded-full" style={{ background: selected ? "var(--signal-canon)" : "transparent" }} />
                </button>
              );
            })}
          </div>

          <div
            className="overflow-hidden rounded-[var(--radius-lg)] border"
            style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)", boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
              <span className="author-mono text-xs" style={{ color: "var(--ink-700)" }}>
                {mode.id}.preview
              </span>
              <span className="author-badge" style={{ background: "var(--ink-100)", color: "var(--ink-700)" }}>
                synthetic demo data
              </span>
            </div>
            <div className="p-6 md:p-7">
              <h3 className="author-serif text-2xl" style={{ color: "var(--ink-900)" }}>
                {mode.name}
              </h3>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                {mode.body}
              </p>
              <ModePreview kind={mode.id} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeGlyph({ kind, active }: { kind: ModeId; active: boolean }) {
  const color = active ? "var(--ink-900)" : "var(--ink-500)";

  return (
    <span
      className="flex h-9 w-9 flex-none items-center justify-center rounded-[var(--radius-md)]"
      style={{ background: active ? "var(--signal-canon-soft)" : "var(--ink-100)" }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        {kind === "native" ? (
          <>
            <rect x="2" y="3" width="14" height="12" rx="1.5" stroke={color} strokeWidth="1.4" />
            <line x1="5" y1="7" x2="13" y2="7" stroke={color} strokeWidth="1.4" />
            <line x1="5" y1="10" x2="11" y2="10" stroke={color} strokeWidth="1.4" />
          </>
        ) : null}
        {kind === "docx" ? (
          <>
            <path d="M4 2 H10 L14 6 V16 H4 Z" stroke={color} strokeWidth="1.4" />
            <path d="M10 2 V6 H14" stroke={color} strokeWidth="1.4" />
          </>
        ) : null}
        {kind === "plain" ? (
          <>
            <line x1="3" y1="5" x2="15" y2="5" stroke={color} strokeWidth="1.4" />
            <line x1="3" y1="9" x2="13" y2="9" stroke={color} strokeWidth="1.4" />
            <line x1="3" y1="13" x2="11" y2="13" stroke={color} strokeWidth="1.4" />
          </>
        ) : null}
        {kind === "gdocs" ? (
          <>
            <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.4" />
            <path d="M9 4 V9 L12 11" stroke={color} strokeWidth="1.4" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function ModePreview({ kind }: { kind: ModeId }) {
  if (kind === "native") {
    return (
      <div className="mt-6 rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
        <p className="author-mono mb-2 text-[11px]" style={{ color: "var(--ink-500)" }}>
          scene 14 / the observatory
        </p>
        <p className="text-sm leading-7" style={{ color: "var(--ink-800)" }}>
          Han Iseul climbed the rooftop on day{" "}
          <span className="rounded px-1.5 py-0.5" style={{ background: "var(--signal-conflict-soft)", color: "var(--signal-conflict-ink)", borderBottom: "1px solid var(--signal-conflict)" }}>
            9
          </span>
          .
        </p>
      </div>
    );
  }

  if (kind === "docx") {
    return (
      <div className="mt-6 grid gap-2">
        <PreviewRow file="manuscript_v3.docx" status="parsed" detail="142 facts / 8 chars / 22 rules" />
        <PreviewRow file="appendix_lore.docx" status="parsed" detail="36 facts / 3 rules" />
        <PreviewRow file="character_bible.rtf" status="conflicts" detail="3 conflicts in canon" />
      </div>
    );
  }

  if (kind === "plain") {
    return (
      <div className="mt-6 rounded-[var(--radius-md)] p-4" style={{ background: "var(--ink-900)", color: "oklch(1 0 0 / 0.88)" }}>
        <div className="author-mono text-xs leading-7">
          <div style={{ color: "oklch(1 0 0 / 0.48)" }}># scene-14-observatory.md</div>
          <div>## The Observatory</div>
          <div style={{ color: "oklch(1 0 0 / 0.62)" }}>characters: [han_iseul, jeong_serin]</div>
          <div style={{ color: "oklch(1 0 0 / 0.62)" }}>day: 14</div>
          <div style={{ marginTop: 6 }}>The eclipse begins on schedule.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--signal-canon)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--ink-900)" }}>
          saebyeok-draft.gdoc
        </span>
        <span className="author-mono ml-auto text-[11px]" style={{ color: "var(--ink-500)" }}>
          synced 2s ago
        </span>
      </div>
      <p className="text-sm leading-6" style={{ color: "var(--ink-600)" }}>
        3 new comments on canon-conflicts thread / 2 resolved by author
      </p>
    </div>
  );
}

function PreviewRow({ file, status, detail }: { file: string; status: "parsed" | "conflicts"; detail: string }) {
  const conflict = status === "conflicts";
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: conflict ? "var(--signal-conflict)" : "var(--signal-canon)" }} />
      <div className="flex-1">
        <p className="author-mono text-xs" style={{ color: "var(--ink-800)" }}>
          {file}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-500)" }}>
          {detail}
        </p>
      </div>
      <span
        className="author-badge"
        style={{
          background: conflict ? "var(--signal-conflict-soft)" : "var(--signal-canon-soft)",
          color: conflict ? "var(--signal-conflict-ink)" : "var(--signal-canon-ink)",
        }}
      >
        {status}
      </span>
    </div>
  );
}
