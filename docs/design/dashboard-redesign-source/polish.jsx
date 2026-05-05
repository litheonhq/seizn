// Seizn Author — Polish components: Conflict card, Empty state, Skeletons

// ─────────────────────────────────────────────────────────────
// Conflict card v2 — 3-tier severity (terracotta / dawn / muted)
// ─────────────────────────────────────────────────────────────
const ConflictCard = ({ severity = 'P1', kind, title, episode, why, refs = [], compact = false }) => {
  const sev = {
    P1: { bg: 'var(--sev-p1-bg)', bd: 'var(--sev-p1-border)', fg: 'var(--sev-p1-text)', label: 'Critical' },
    P2: { bg: 'var(--sev-p2-bg)', bd: 'var(--sev-p2-border)', fg: 'var(--sev-p2-text)', label: 'Warning' },
    P3: { bg: 'var(--sev-p3-bg)', bd: 'var(--sev-p3-border)', fg: 'var(--sev-p3-text)', label: 'Note' },
  }[severity];

  return (
    <article style={{
      background: 'var(--ink-0)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-card)',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: sev.bd,
      }}/>
      <div style={{
        padding: '12px 16px 8px 18px', display: 'flex', alignItems: 'center', gap: 8,
        background: sev.bg, borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em',
          color: sev.fg, textTransform: 'uppercase',
        }}>{severity} · {sev.label}</span>
        <span style={{ width: 3, height: 3, borderRadius: 2, background: sev.fg, opacity: .5 }}/>
        <span style={{ fontSize: 11.5, color: sev.fg, fontWeight: 500 }}>{kind}</span>
        <span style={{ flex: 1 }}/>
        <span className="mono" style={{ fontSize: 10.5, color: sev.fg }}>{episode}</span>
      </div>
      <div style={{ padding: '14px 18px 16px' }}>
        <h3 className="serif" style={{
          fontSize: compact ? 15 : 17, fontWeight: 500, lineHeight: 1.3, margin: 0,
          letterSpacing: '-0.015em', color: 'var(--text-primary)',
        }}>{title}</h3>
        {why && (
          <p style={{
            fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-tertiary)',
            margin: '8px 0 0',
          }}>{why}</p>
        )}
        {refs.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {refs.map((r, i) => (
              <span key={i} className="mono" style={{
                fontSize: 10.5, padding: '2px 7px', borderRadius: 5,
                background: 'var(--ink-25)', color: 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}>{r}</span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <button style={{
            all: 'unset', cursor: 'pointer', padding: '6px 12px',
            background: 'var(--ink-900)', color: 'var(--ink-25)',
            borderRadius: 7, fontSize: 12, fontWeight: 600,
          }}>Resolve</button>
          <button style={{
            all: 'unset', cursor: 'pointer', padding: '6px 12px',
            border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
            borderRadius: 7, fontSize: 12, fontWeight: 600,
          }}>Open evidence</button>
          <span style={{ flex: 1 }}/>
          <button style={{
            all: 'unset', cursor: 'pointer', fontSize: 11.5,
            color: 'var(--text-muted)', fontWeight: 500,
          }}>Dismiss</button>
        </div>
      </div>
    </article>
  );
};

// ─────────────────────────────────────────────────────────────
// Empty state — friendly EN copy + small illustration (writer's desk)
// ─────────────────────────────────────────────────────────────
const EmptyIllustration = ({ kind = 'characters' }) => {
  // Tiny, subtle line illustration. No emoji. No "AI slop" SVG.
  const stroke = 'rgba(74,67,56,.35)';
  const accent = 'var(--terracotta-500)';
  if (kind === 'characters') {
    return (
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
        <rect x="20" y="30" width="80" height="56" rx="3" stroke={stroke} strokeWidth="1.4"/>
        <line x1="20" y1="44" x2="100" y2="44" stroke={stroke} strokeWidth="1.4"/>
        <circle cx="36" cy="60" r="6" stroke={stroke} strokeWidth="1.4"/>
        <line x1="48" y1="58" x2="86" y2="58" stroke={stroke} strokeWidth="1.4"/>
        <line x1="48" y1="64" x2="76" y2="64" stroke={stroke} strokeWidth="1.4" opacity=".6"/>
        <circle cx="36" cy="76" r="6" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2"/>
        <line x1="48" y1="74" x2="86" y2="74" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2"/>
        <line x1="48" y1="80" x2="70" y2="80" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2" opacity=".6"/>
        <circle cx="92" cy="22" r="7" fill={accent} opacity=".15"/>
        <circle cx="92" cy="22" r="3" fill={accent}/>
      </svg>
    );
  }
  if (kind === 'inbox') {
    return (
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
        <path d="M22 38 L60 22 L98 38 L98 78 Q98 82 94 82 L26 82 Q22 82 22 78 Z" stroke={stroke} strokeWidth="1.4"/>
        <path d="M22 38 L60 60 L98 38" stroke={stroke} strokeWidth="1.4"/>
        <circle cx="60" cy="38" r="2.5" fill={accent}/>
      </svg>
    );
  }
  // graph
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
      <line x1="40" y1="40" x2="80" y2="40" stroke={stroke} strokeWidth="1.4"/>
      <line x1="40" y1="40" x2="50" y2="74" stroke={stroke} strokeWidth="1.4"/>
      <line x1="80" y1="40" x2="74" y2="74" stroke={stroke} strokeWidth="1.4"/>
      <circle cx="40" cy="40" r="9" fill="var(--ink-25)" stroke={stroke} strokeWidth="1.4"/>
      <circle cx="80" cy="40" r="9" fill="var(--ink-25)" stroke={stroke} strokeWidth="1.4"/>
      <circle cx="50" cy="74" r="6" fill={accent} fillOpacity=".18" stroke={accent} strokeWidth="1.4"/>
      <circle cx="74" cy="74" r="6" fill="var(--ink-25)" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2"/>
    </svg>
  );
};

const EmptyState = ({ kind = 'characters', title, body, primary, hints = [] }) => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: 40,
  }}>
    <EmptyIllustration kind={kind}/>
    <h3 className="serif" style={{
      fontSize: 22, fontWeight: 500, fontStyle: 'italic',
      letterSpacing: '-0.018em', margin: '20px 0 6px', color: 'var(--text-primary)',
    }}>{title}</h3>
    <p style={{
      fontSize: 13.5, lineHeight: 1.55, margin: 0, maxWidth: 360,
      color: 'var(--text-tertiary)',
    }}>{body}</p>
    {primary && (
      <button style={{
        all: 'unset', cursor: 'pointer', marginTop: 18, padding: '8px 14px',
        background: 'var(--ink-900)', color: 'var(--ink-25)',
        borderRadius: 7, fontSize: 12.5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{I.plus} {primary}</button>
    )}
    {hints.length > 0 && (
      <div style={{
        marginTop: 24, display: 'flex', gap: 18, fontSize: 11.5,
        color: 'var(--text-muted)',
      }}>
        {hints.map((h, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <KBD style={{ fontSize: 9.5 }}>{h.k}</KBD> {h.t}
          </span>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Skeleton — list rows
// ─────────────────────────────────────────────────────────────
const SkeletonInbox = () => (
  <div>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Skel w={48} h={14} r={4}/>
          <Skel w={36} h={12} r={4}/>
        </div>
        <Skel w="92%" h={14} style={{ marginBottom: 6 }}/>
        <Skel w="60%" h={11}/>
      </div>
    ))}
  </div>
);

Object.assign(window, { ConflictCard, EmptyState, EmptyIllustration, SkeletonInbox });
