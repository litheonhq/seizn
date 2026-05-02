/* global React */
const { useState: useStateSm } = React;

/* ——————————————————————————————————————
   SIMULATION SECTION — safe / risk candidate split
———————————————————————————————————————— */

const CANDIDATES = [
  {
    side: 'safe',
    label: 'Safe path',
    pct: 92,
    title: 'Han Iseul stays at the observatory until dawn.',
    body: 'Honors r02 (eclipse on day 23) and r04 (no two-location overlap). No new conflicts. Continuity intact.',
    tokens: ['scene.continues', 'rule.r02', 'rule.r04'],
  },
  {
    side: 'risk',
    label: 'Risk path',
    pct: 41,
    title: 'Han Iseul leaves before the eclipse peak.',
    body: 'Drops r02 anchoring. Two scenes downstream lose their grounding event. Three minor conflicts predicted.',
    tokens: ['drops.r02', 'scene.16.orphan', 'scene.21.orphan'],
  },
];

function Simulation() {
  return (
    <section style={{ background: 'var(--ink-0)', padding: '96px 56px' }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="05 / simulation"
          title="Replay before you commit."
          sub="Stage a scene against the ledger. Seizn projects downstream impact at the token level — safe paths and risk paths, ranked."
          align="left"
        />

        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
        }}>
          {CANDIDATES.map((c, i) => (
            <CandidateCard key={i} c={c} />
          ))}
        </div>

        <TokenPreview />
      </div>
    </section>
  );
}

function CandidateCard({ c }) {
  const isSafe = c.side === 'safe';
  const accent = isSafe ? 'var(--signal-canon)' : 'var(--signal-conflict)';
  const accentSoft = isSafe ? 'var(--signal-canon-soft)' : 'var(--signal-conflict-soft)';
  const accentInk = isSafe ? 'var(--signal-canon-ink)' : 'var(--signal-conflict-ink)';

  return (
    <div style={{
      padding: 28,
      background: 'var(--ink-0)',
      border: '1px solid var(--ink-100)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* gauge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span className="badge" style={{ background: accentSoft, color: accentInk }}>
          <span className="badge-dot" style={{ background: accent }} />
          {c.label}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-500)' }}>
          continuity {c.pct}%
        </span>
      </div>

      <div style={{
        height: 4, background: 'var(--ink-100)', borderRadius: 999,
        overflow: 'hidden', marginBottom: 22,
      }}>
        <div style={{
          width: `${c.pct}%`, height: '100%', background: accent,
          transition: 'width 600ms cubic-bezier(.2,.7,.3,1)',
        }} />
      </div>

      <h3 className="serif" style={{
        fontSize: 22, margin: 0, color: 'var(--ink-900)',
        fontWeight: 400, lineHeight: 1.25, letterSpacing: '-0.01em',
      }}>
        {c.title}
      </h3>
      <p style={{
        marginTop: 12, fontSize: 14.5, lineHeight: 1.6,
        color: 'var(--ink-600)', textWrap: 'pretty',
      }}>
        {c.body}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
        {c.tokens.map((t) => (
          <span key={t} className="mono" style={{
            padding: '3px 8px', borderRadius: 4,
            background: 'var(--ink-50)', border: '1px solid var(--ink-100)',
            fontSize: 10, color: 'var(--ink-700)',
          }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TokenPreview() {
  return (
    <div style={{
      marginTop: 32,
      padding: 24,
      background: 'var(--ink-900)',
      borderRadius: 'var(--radius-lg)',
      color: 'var(--ink-0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className="mono" style={{ fontSize: 12, color: 'oklch(1 0 0 / 0.6)' }}>
          token-level diff &middot; scene 14.observatory.draft
        </span>
        <span className="badge badge-canon" style={{ fontSize: 10 }}>
          replay ready
        </span>
      </div>
      <div className="mono" style={{ fontSize: 13.5, lineHeight: 1.8, color: 'oklch(1 0 0 / 0.92)' }}>
        <span style={{ color: 'oklch(1 0 0 / 0.5)' }}>14:</span>{' '}
        Han Iseul climbed the rooftop on day{' '}
        <span style={{
          background: 'oklch(0.60 0.21 27 / 0.18)',
          color: 'var(--signal-conflict)',
          padding: '1px 4px', borderRadius: 3,
        }}>
          9
        </span>{' '}
        <span style={{ color: 'oklch(1 0 0 / 0.4)' }}>// proposed</span>
        <br />
        <span style={{ color: 'oklch(1 0 0 / 0.5)' }}>14:</span>{' '}
        Han Iseul climbed the rooftop on day{' '}
        <span style={{
          background: 'oklch(0.62 0.16 148 / 0.16)',
          color: 'var(--signal-canon)',
          padding: '1px 4px', borderRadius: 3,
        }}>
          14
        </span>{' '}
        <span style={{ color: 'oklch(1 0 0 / 0.4)' }}>// safe rewrite</span>
      </div>
    </div>
  );
}

window.Simulation = Simulation;
