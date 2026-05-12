import type { CSSProperties, ReactNode } from "react";

type PillTone = "muted" | "live" | "progress" | "roadmap" | "violet" | "cyan";

const PILL_TONES: Record<PillTone, { bg: string; color: string; border: string }> = {
  muted:    { bg: "rgba(148, 163, 184, 0.08)", color: "var(--engine-text-muted)", border: "rgba(148, 163, 184, 0.16)" },
  live:     { bg: "rgba(52, 211, 153, 0.10)",  color: "var(--engine-live)",       border: "rgba(52, 211, 153, 0.30)" },
  progress: { bg: "rgba(251, 191, 36, 0.10)",  color: "var(--engine-progress)",   border: "rgba(251, 191, 36, 0.30)" },
  roadmap:  { bg: "rgba(100, 116, 139, 0.10)", color: "var(--engine-roadmap)",    border: "rgba(100, 116, 139, 0.25)" },
  violet:   { bg: "rgba(124, 58, 237, 0.12)",  color: "var(--engine-violet-soft)",border: "rgba(124, 58, 237, 0.35)" },
  cyan:     { bg: "rgba(34, 211, 238, 0.10)",  color: "var(--engine-cyan-soft)",  border: "rgba(34, 211, 238, 0.30)" },
};

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: PillTone }) {
  const t = PILL_TONES[tone];
  return (
    <span
      className="engine-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        padding: "3px 8px",
        borderRadius: 4,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "live" }: { tone?: "live" | "progress" | "roadmap" }) {
  const colors = {
    live: "var(--engine-live)",
    progress: "var(--engine-progress)",
    roadmap: "var(--engine-roadmap)",
  } as const;
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: 99,
        background: colors[tone],
        boxShadow: tone === "live" ? `0 0 8px ${colors[tone]}` : "none",
        animation: tone === "live" ? "engine-pulse-soft 2.4s ease-in-out infinite" : "none",
      }}
    />
  );
}

export function SeasonRow() {
  const seasons = [
    { name: "Spring", color: "var(--engine-spring)", label: "Fresh — last 24h" },
    { name: "Summer", color: "var(--engine-summer)", label: "Active — 1d to 7d" },
    { name: "Fall",   color: "var(--engine-fall)",   label: "Cooling — 7d to 30d" },
    { name: "Winter", color: "var(--engine-winter)", label: "Consolidated — 30d+" },
  ];
  return (
    <div className="engine-season-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {seasons.map((s) => (
        <div key={s.name} style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12, borderTop: "1px solid var(--engine-line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
            <span className="engine-mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--engine-text-strong)" }}>
              {s.name}
            </span>
          </div>
          <span className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-dim)" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "cyan";

const BTN_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "11px 18px",
  minHeight: 44,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  transition: "all 160ms ease",
  border: "1px solid transparent",
  fontFamily: "var(--engine-font-sans)",
  cursor: "pointer",
};

const BTN_VARIANTS: Record<BtnVariant, CSSProperties> = {
  primary: {
    background: "var(--engine-violet)",
    color: "#FFFFFF",
    borderColor: "color-mix(in oklab, var(--engine-violet), white 12%)",
    boxShadow: "0 0 0 1px rgba(124, 58, 237, 0.4) inset, 0 8px 28px -10px rgba(124, 58, 237, 0.65)",
  },
  secondary: {
    background: "rgba(255,255,255,0.04)",
    color: "var(--engine-text-strong)",
    borderColor: "var(--engine-line-bright)",
  },
  ghost: { background: "transparent", color: "var(--engine-text-base)" },
  cyan: {
    background: "transparent",
    color: "var(--engine-cyan)",
    borderColor: "rgba(34, 211, 238, 0.3)",
  },
};

export function Btn({
  variant = "primary",
  children,
  icon,
  href,
  target,
  rel,
  onClick,
  type = "button",
  style,
}: {
  variant?: BtnVariant;
  children: ReactNode;
  icon?: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const merged: CSSProperties = { ...BTN_BASE, ...BTN_VARIANTS[variant], ...style };
  if (href) {
    return (
      <a href={href} target={target} rel={rel} style={merged}>
        {children}
        {icon}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} style={merged}>
      {children}
      {icon}
    </button>
  );
}

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }} aria-hidden>
      <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/seizn-engine-logo.png"
        alt=""
        width={size}
        height={size}
        style={{ display: "block", flexShrink: 0 }}
        aria-hidden
      />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, color: "var(--engine-text-strong)", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
        Seizn
        <span className="engine-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--engine-violet-soft)", textTransform: "uppercase", fontWeight: 500 }}>
          Engine
        </span>
      </span>
    </div>
  );
}

export function Section({
  id,
  eyebrow,
  children,
  style,
}: {
  id?: string;
  eyebrow?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      className="engine-section"
      id={id}
      style={{
        position: "relative",
        padding: "calc(96px * var(--engine-rhythm)) 56px",
        background: "var(--engine-bg-base)",
        color: "var(--engine-text-base)",
        ...style,
      }}
    >
      {eyebrow ? (
        <div className="engine-eyebrow" style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 18, height: 1, background: "var(--engine-line-bright)" }} />
          {eyebrow}
        </div>
      ) : null}
      <div className="engine-section-shell" style={{ maxWidth: 1280, margin: "0 auto" }}>{children}</div>
    </section>
  );
}
