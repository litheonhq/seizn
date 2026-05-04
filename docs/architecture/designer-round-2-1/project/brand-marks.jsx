/* global React */
const { useState, useEffect, useRef } = React;

/* ——————————————————————————————————————
   BRAND MARK CANDIDATES
   Constraints:
   - NO Korean / Asian motif
   - NO S+C monogram
   - NO warm cream / terracotta / serif (TheLabForge)
   - NO ivory / ink / dawn (Usan)
   - NO purple / violet (Sudowrite)
   - NO book/page imagery (NovelCrafter)
   - NO pure black + lime (Linear)
———————————————————————————————————————— */

/* A — Canon-graph node mark: 4 nodes + edges, asymmetric */
function MarkGraphNode({ size = 32, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* edges */}
      <line x1="8" y1="9" x2="22" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="8" y1="9" x2="11" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="22" y1="11" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="11" y1="23" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      {/* nodes */}
      <circle cx="8" cy="9" r="3" fill={color} />
      <circle cx="22" cy="11" r="2.4" fill={color} />
      <circle cx="11" cy="23" r="2.2" fill={color} />
      <circle cx="24" cy="23" r="3.2" fill={color} />
    </svg>
  );
}

/* B — Strata mark: layered horizontal bars (memory layers, abstracted) */
function MarkStrata({ size = 32, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="7" width="20" height="2.8" rx="1.4" fill={color} opacity="0.35" />
      <rect x="6" y="13" width="22" height="2.8" rx="1.4" fill={color} opacity="0.6" />
      <rect x="3" y="19" width="18" height="2.8" rx="1.4" fill={color} opacity="0.85" />
      <rect x="7" y="25" width="14" height="2.4" rx="1.2" fill={color} />
    </svg>
  );
}

/* C — Bracketed: [s] glyph */
function MarkBracket({ size = 32, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M11 6 H6 V26 H11" stroke={color} strokeWidth="2.2" strokeLinecap="square" fill="none" />
      <path d="M21 6 H26 V26 H21" stroke={color} strokeWidth="2.2" strokeLinecap="square" fill="none" />
      <circle cx="16" cy="16" r="2.6" fill={color} />
    </svg>
  );
}

/* D — Pure wordmark: just the dot, mark is the wordmark itself */
function MarkDot({ size = 32, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="1.5" fill="none" opacity="0.4" />
      <circle cx="22" cy="22" r="3" fill={color} />
    </svg>
  );
}

/* Lockup component — mark + wordmark */
function Lockup({ variant, size = 'md', tone = 'dark' }) {
  const color = tone === 'dark' ? 'var(--ink-900)' : 'var(--ink-0)';
  const px = size === 'lg' ? 36 : size === 'sm' ? 22 : 28;
  const wordSize = size === 'lg' ? 24 : size === 'sm' ? 16 : 19;
  const Mark = { graph: MarkGraphNode, strata: MarkStrata, bracket: MarkBracket, dot: MarkDot, none: null }[variant];

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: variant === 'none' ? 0 : 10, color }}>
      {Mark && <Mark size={px} color={color} />}
      <span
        className="serif"
        style={{
          fontSize: wordSize,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color,
          fontFeatureSettings: "'ss01'",
        }}
      >
        seizn{variant === 'bracket' ? '' : ''}
        {variant === 'dot' && <span style={{ color: 'var(--signal-canon)' }}>.</span>}
      </span>
    </div>
  );
}

/* Brand-mark candidate card (for canvas) */
function BrandMarkCard({ variant, label, note, kind }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: 320, height: 360,
      background: 'var(--ink-0)',
      border: '1px solid var(--ink-100)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* Light preview */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink-50)', borderBottom: '1px solid var(--ink-100)',
      }}>
        <Lockup variant={variant} size="lg" tone="dark" />
      </div>
      {/* Dark preview */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink-900)',
      }}>
        <Lockup variant={variant} size="lg" tone="light" />
      </div>
      {/* Label strip */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--ink-100)' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>{kind}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.4 }}>{note}</div>
      </div>
    </div>
  );
}

window.MarkGraphNode = MarkGraphNode;
window.MarkStrata = MarkStrata;
window.MarkBracket = MarkBracket;
window.MarkDot = MarkDot;
window.Lockup = Lockup;
window.BrandMarkCard = BrandMarkCard;
