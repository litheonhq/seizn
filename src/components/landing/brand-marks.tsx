type MarkVariant = "graph" | "dot";
type MarkTone = "dark" | "light";

interface MarkProps {
  size?: number;
  color?: string;
  title?: string;
}

export function SeiznMark({ size = 32, color = "currentColor", title }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role={title ? "img" : "presentation"} aria-label={title}>
      <line x1="8" y1="9" x2="22" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="8" y1="9" x2="11" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="22" y1="11" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="11" y1="23" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <circle cx="8" cy="9" r="3" fill={color} />
      <circle cx="22" cy="11" r="2.4" fill={color} />
      <circle cx="11" cy="23" r="2.2" fill={color} />
      <circle cx="24" cy="23" r="3.2" fill={color} />
    </svg>
  );
}

export function SeiznDotMark({ size = 32, color = "currentColor", title }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role={title ? "img" : "presentation"} aria-label={title}>
      <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="1.5" fill="none" opacity="0.4" />
      <circle cx="22" cy="22" r="3" fill={color} />
    </svg>
  );
}

export function SeiznLockup({
  variant = "graph",
  tone = "dark",
  size = "md",
}: {
  variant?: MarkVariant;
  tone?: MarkTone;
  size?: "sm" | "md" | "lg";
}) {
  const color = tone === "dark" ? "var(--ink-900)" : "var(--ink-0)";
  const markSize = size === "lg" ? 36 : size === "sm" ? 24 : 30;
  const wordSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const Mark = variant === "dot" ? SeiznDotMark : SeiznMark;

  return (
    <span className="inline-flex items-center gap-2.5" style={{ color }}>
      <Mark size={markSize} color={color} />
      <span className={`author-serif ${wordSize} leading-none`} style={{ color }}>
        seizn
        {variant === "dot" ? <span style={{ color: "var(--signal-canon)" }}>.</span> : null}
      </span>
    </span>
  );
}
