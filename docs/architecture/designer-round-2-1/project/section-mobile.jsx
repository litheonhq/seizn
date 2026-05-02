/* global React, ConflictDetector, Lockup */
const { useState: useStateMb } = React;

/* ——————————————————————————————————————
   MOBILE HERO — 360px viewport
———————————————————————————————————————— */

function MobileHero({ markVariant = 'graph' }) {
  return (
    <div style={{
      width: 360, background: 'var(--ink-900)', color: 'var(--ink-0)',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
    }}>
      {/* Mobile nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid oklch(1 0 0 / 0.08)',
      }}>
        <Lockup variant={markVariant} size="sm" tone="light" />
        <button style={{
          width: 32, height: 32, borderRadius: 6,
          background: 'oklch(1 0 0 / 0.06)',
          border: '1px solid oklch(1 0 0 / 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="3" y1="5" x2="13" y2="5" stroke="var(--ink-0)" strokeWidth="1.4" />
            <line x1="3" y1="11" x2="13" y2="11" stroke="var(--ink-0)" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '36px 24px 40px' }}>
        <div className="eyebrow" style={{ color: 'oklch(1 0 0 / 0.55)', marginBottom: 16 }}>
          01 / author memory
        </div>
        <h1 className="serif" style={{
          fontSize: 38, margin: 0, color: 'var(--ink-0)',
          fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.015em',
        }}>
          Catch every<br />
          <em style={{ fontStyle: 'italic', fontWeight: 400 }}>contradiction</em><br />
          before it ships.
        </h1>
        <p style={{
          marginTop: 18, fontSize: 15, lineHeight: 1.55,
          color: 'oklch(1 0 0 / 0.72)', textWrap: 'pretty',
        }}>
          Type a fact. Seizn reconciles it against your canon. Your review is the verdict.
        </p>

        {/* Mini character chip strip — addresses item R for mobile */}
        <div style={{
          marginTop: 24, display: 'flex', gap: 6, overflow: 'hidden',
          padding: '12px 0', borderTop: '1px solid oklch(1 0 0 / 0.08)',
          borderBottom: '1px solid oklch(1 0 0 / 0.08)',
        }}>
          {['Han Iseul', 'Jeong Serin', 'Yun Hana', 'Park Jio'].map((c, i) => (
            <span key={c} style={{
              padding: '5px 10px', borderRadius: 999,
              background: 'oklch(1 0 0 / 0.06)',
              border: '1px solid oklch(1 0 0 / 0.1)',
              fontSize: 11, color: 'oklch(1 0 0 / 0.85)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <span style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: 999,
                background: i === 2 ? 'var(--signal-conflict)' : 'var(--signal-canon)',
                marginRight: 5, verticalAlign: 'middle',
              }} />
              {c}
            </span>
          ))}
        </div>

        {/* Plan picker — vertical on mobile */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary" style={{
            width: '100%', justifyContent: 'center',
            background: 'var(--ink-0)', color: 'var(--ink-900)',
            padding: '14px 18px', fontWeight: 500, fontSize: 15,
          }}>
            Start Indie &mdash; $39/mo &rarr;
          </button>
          <button style={{
            width: '100%', padding: '12px 16px',
            background: 'transparent',
            border: '1px solid oklch(1 0 0 / 0.18)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--ink-0)', fontSize: 14,
          }}>
            Compare Pro &middot; Studio &middot; Enterprise
          </button>
        </div>

        <div style={{
          marginTop: 18, fontSize: 12,
          color: 'oklch(1 0 0 / 0.5)', textAlign: 'center',
        }}>
          30-day trial &middot; no card &middot; BYOK 50% off
        </div>
      </div>
    </div>
  );
}

/* ——————————————————————————————————————
   TABLET HERO — 768px viewport
———————————————————————————————————————— */

function TabletHero({ markVariant = 'graph' }) {
  return (
    <div style={{
      width: 768, background: 'var(--ink-900)', color: 'var(--ink-0)',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px',
        borderBottom: '1px solid oklch(1 0 0 / 0.08)',
      }}>
        <Lockup variant={markVariant} size="md" tone="light" />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {['Workflow', 'Pricing', 'Docs'].map((l) => (
            <a key={l} href="#" style={{ fontSize: 13, color: 'oklch(1 0 0 / 0.62)' }}>{l}</a>
          ))}
          <button className="btn" style={{
            background: 'var(--ink-0)', color: 'var(--ink-900)',
            padding: '8px 14px', fontSize: 13,
          }}>
            Start trial
          </button>
        </div>
      </div>

      <div style={{ padding: '48px 36px 56px', display: 'grid', gap: 32 }}>
        <div>
          <div className="eyebrow" style={{ color: 'oklch(1 0 0 / 0.55)', marginBottom: 18 }}>
            01 / author memory
          </div>
          <h1 className="serif" style={{
            fontSize: 56, margin: 0, fontWeight: 400, lineHeight: 1.05,
            letterSpacing: '-0.015em', color: 'var(--ink-0)', maxWidth: 580,
          }}>
            Catch every <em style={{ fontStyle: 'italic', fontWeight: 400 }}>contradiction</em> before it ships.
          </h1>
          <p style={{
            marginTop: 18, fontSize: 17, lineHeight: 1.55,
            color: 'oklch(1 0 0 / 0.72)', maxWidth: 540, textWrap: 'pretty',
          }}>
            Type a fact. Seizn reconciles it against your canon &mdash; 8 characters, 22 rules, 30 day timeline.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{
              display: 'flex', gap: 6,
              background: 'oklch(1 0 0 / 0.04)',
              border: '1px solid oklch(1 0 0 / 0.08)',
              borderRadius: 'var(--radius-md)',
              padding: 4, marginBottom: 12,
            }}>
              {['Indie', 'Pro', 'Studio'].map((p, i) => (
                <button key={p} style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  color: i === 0 ? 'var(--ink-900)' : 'oklch(1 0 0 / 0.7)',
                  background: i === 0 ? 'var(--ink-0)' : 'transparent',
                  flex: 1,
                }}>
                  {p}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" style={{
              width: '100%', justifyContent: 'center',
              background: 'var(--ink-0)', color: 'var(--ink-900)',
              padding: '12px 18px', fontWeight: 500, fontSize: 14,
            }}>
              Start Indie &mdash; $39/mo &rarr;
            </button>
          </div>
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left' }}>
            <ConflictDetector compact />
          </div>
        </div>
      </div>
    </div>
  );
}

window.MobileHero = MobileHero;
window.TabletHero = TabletHero;
