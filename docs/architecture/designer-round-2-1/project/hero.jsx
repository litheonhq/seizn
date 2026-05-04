/* global React, Lockup, ConflictDetector, CanonGraph */
const { useState: useStateH } = React;

/* ——————————————————————————————————————
   HERO CONCEPT A — Split, graph-led
   Dark left (copy + plan picker) / Dark right (canon graph)
———————————————————————————————————————— */

function HeroSplitGraph({ markVariant = 'graph', accent = 'canon' }) {
  return (
    <div style={{
      width: '100%',
      background: 'var(--ink-900)',
      color: 'var(--ink-0)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <NavBar tone="dark" markVariant={markVariant} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        gap: 56,
        padding: '72px 56px 88px',
        alignItems: 'center',
      }}>
        {/* Left — copy */}
        <div>
          <div className="eyebrow" style={{ color: 'oklch(1 0 0 / 0.55)', marginBottom: 24 }}>
            01 / author memory
          </div>
          <h1 className="serif" style={{
            fontSize: 'var(--t-display)',
            margin: 0,
            color: 'var(--ink-0)',
            fontWeight: 400,
          }}>
            Your canon,<br />
            held to the letter.
          </h1>
          <p style={{
            marginTop: 22,
            fontSize: 18,
            lineHeight: 1.55,
            color: 'oklch(1 0 0 / 0.72)',
            maxWidth: 480,
            textWrap: 'pretty',
          }}>
            Worldbuilding, characters, scenes &mdash; in one ledger.
            Seizn flags every contradiction the moment it appears.
            Your review is the source of truth.
          </p>

          {/* Inline plan picker */}
          <PlanPicker />

          <div style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: 'oklch(1 0 0 / 0.5)',
            fontSize: 13,
          }}>
            <span>30-day trial &middot; no card</span>
            <span style={{ width: 3, height: 3, borderRadius: 999, background: 'oklch(1 0 0 / 0.3)' }} />
            <span>BYOK 50% off &middot; unlimited tokens</span>
          </div>
        </div>

        {/* Right — graph */}
        <div style={{ position: 'relative' }}>
          <CanonGraph tone="dark" width={560} height={460} />
        </div>
      </div>
    </div>
  );
}

/* ——————————————————————————————————————
   HERO CONCEPT B — Split, conflict-detector-led
   Dark left / Light right (live demo card overlapping)
———————————————————————————————————————— */

function HeroSplitDetector({ markVariant = 'graph' }) {
  return (
    <div style={{
      width: '100%',
      background: 'var(--ink-900)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <NavBar tone="dark" markVariant={markVariant} />

      {/* gradient wash bottom-right */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(900px 600px at 80% 100%, oklch(0.62 0.16 148 / 0.10), transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        gap: 48,
        padding: '72px 56px 88px',
        alignItems: 'center',
        position: 'relative',
      }}>
        {/* Left — copy */}
        <div style={{ color: 'var(--ink-0)' }}>
          <div className="eyebrow" style={{ color: 'oklch(1 0 0 / 0.55)', marginBottom: 24 }}>
            01 / author memory
          </div>
          <h1 className="serif" style={{
            fontSize: 'var(--t-display)',
            margin: 0,
            color: 'var(--ink-0)',
            fontWeight: 400,
          }}>
            Catch every<br />
            <em style={{ fontStyle: 'italic', fontWeight: 400 }}>contradiction</em><br />
            before it ships.
          </h1>
          <p style={{
            marginTop: 22,
            fontSize: 18,
            lineHeight: 1.55,
            color: 'oklch(1 0 0 / 0.72)',
            maxWidth: 460,
            textWrap: 'pretty',
          }}>
            Type a fact. Seizn reconciles it against your canon &mdash;
            8 characters, 22 rules, 30 day timeline. Your review is the verdict.
          </p>

          <PlanPicker />

          <div style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: 'oklch(1 0 0 / 0.5)',
            fontSize: 13,
          }}>
            <span>30-day trial &middot; no card</span>
            <span style={{ width: 3, height: 3, borderRadius: 999, background: 'oklch(1 0 0 / 0.3)' }} />
            <span>BYOK 50% off</span>
          </div>
        </div>

        {/* Right — live detector */}
        <div style={{ position: 'relative' }}>
          <ConflictDetector compact />
        </div>
      </div>
    </div>
  );
}

/* ——————————————————————————————————————
   NAV BAR
———————————————————————————————————————— */

function NavBar({ tone = 'dark', markVariant = 'graph' }) {
  const fg = tone === 'dark' ? 'var(--ink-0)' : 'var(--ink-900)';
  const sub = tone === 'dark' ? 'oklch(1 0 0 / 0.62)' : 'var(--ink-600)';
  const border = tone === 'dark' ? 'oklch(1 0 0 / 0.08)' : 'var(--ink-100)';

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px',
      borderBottom: `1px solid ${border}`,
    }}>
      <Lockup variant={markVariant} size="md" tone={tone === 'dark' ? 'light' : 'dark'} />
      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        {['Workflow', 'Demo', 'Pricing', 'Docs'].map((l) => (
          <a key={l} href="#" style={{ color: sub, fontSize: 14, fontWeight: 500 }}>{l}</a>
        ))}
        <span style={{ width: 1, height: 18, background: border }} />
        <a href="#" style={{ color: sub, fontSize: 14, fontWeight: 500 }}>Sign in</a>
        <button className="btn btn-primary" style={{
          padding: '8px 14px',
          fontSize: 13,
          background: tone === 'dark' ? 'var(--ink-0)' : 'var(--ink-900)',
          color: tone === 'dark' ? 'var(--ink-900)' : 'var(--ink-0)',
          border: 'none',
        }}>
          Start trial
        </button>
      </div>
    </nav>
  );
}

/* ——————————————————————————————————————
   INLINE PLAN PICKER (item S)
———————————————————————————————————————— */

const PLANS = [
  { id: 'indie', name: 'Indie', price: 39, blurb: 'Solo authors' },
  { id: 'pro', name: 'Pro', price: 149, blurb: 'Pro studios' },
  { id: 'studio', name: 'Studio', price: 499, blurb: 'Teams' },
];

function PlanPicker() {
  const [plan, setPlan] = useStateH('indie');
  const [yearly, setYearly] = useStateH(false);
  const current = PLANS.find((p) => p.id === plan);
  const price = yearly ? Math.round(current.price * 12 * 0.85) : current.price;
  const cadence = yearly ? '/yr' : '/mo';

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{
        display: 'flex',
        gap: 6,
        background: 'oklch(1 0 0 / 0.04)',
        border: '1px solid oklch(1 0 0 / 0.08)',
        borderRadius: 'var(--radius-md)',
        padding: 4,
        width: 'fit-content',
        marginBottom: 12,
      }}>
        {PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: plan === p.id ? 'var(--ink-900)' : 'oklch(1 0 0 / 0.7)',
              background: plan === p.id ? 'var(--ink-0)' : 'transparent',
              transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            {p.name}
            <span className="mono" style={{
              marginLeft: 8,
              fontSize: 11,
              color: plan === p.id ? 'var(--ink-500)' : 'oklch(1 0 0 / 0.4)',
            }}>
              ${p.price}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          style={{
            background: 'var(--ink-0)',
            color: 'var(--ink-900)',
            padding: '14px 22px',
            fontWeight: 500,
            fontSize: 15,
          }}
        >
          Start {current.name} &mdash; ${price}{cadence}
          <span style={{ marginLeft: 6 }}>&rarr;</span>
        </button>
        <button
          onClick={() => setYearly((y) => !y)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'transparent',
            border: '1px solid oklch(1 0 0 / 0.18)',
            borderRadius: 'var(--radius-md)',
            color: 'oklch(1 0 0 / 0.85)',
            fontSize: 13,
          }}
        >
          <span style={{
            display: 'inline-block', width: 28, height: 16, borderRadius: 999,
            background: yearly ? 'var(--signal-canon)' : 'oklch(1 0 0 / 0.18)',
            position: 'relative',
            transition: 'background 160ms ease',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: yearly ? 14 : 2,
              width: 12, height: 12, borderRadius: 999, background: 'var(--ink-0)',
              transition: 'left 160ms ease',
            }} />
          </span>
          Yearly &middot; save 15%
        </button>
      </div>
    </div>
  );
}

window.HeroSplitGraph = HeroSplitGraph;
window.HeroSplitDetector = HeroSplitDetector;
window.NavBar = NavBar;
window.PlanPicker = PlanPicker;
