/* global React */

/* ——————————————————————————————————————
   TRUST + PRICING + FAQ + FOOTER + ENGINE TEASE + MOBILE HERO
———————————————————————————————————————— */

const TRUST_ITEMS = [
  { glyph: 'lock', title: 'Workspace-isolated', body: 'Sample IP is synthetic. Your manuscript never trains a public model.' },
  { glyph: 'key', title: 'BYOK supported', body: 'Bring your own model key. 50% off list price, unlimited tokens.' },
  { glyph: 'archive', title: 'Replayable canon', body: 'Every verdict is logged. Roll back, branch, or audit any decision.' },
  { glyph: 'shield', title: 'SFW-only policy', body: 'Litheon LLC operates Seizn under a strict safe-for-work content rule.' },
];

function TrustGlyph({ kind }) {
  const c = 'var(--ink-700)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      {kind === 'lock' && (<>
        <rect x="4" y="10" width="14" height="9" rx="1.5" stroke={c} strokeWidth="1.4" />
        <path d="M7 10 V7 a4 4 0 0 1 8 0 V10" stroke={c} strokeWidth="1.4" />
      </>)}
      {kind === 'key' && (<>
        <circle cx="7" cy="11" r="3.5" stroke={c} strokeWidth="1.4" />
        <path d="M10.5 11 H18 V14 M14 11 V13" stroke={c} strokeWidth="1.4" />
      </>)}
      {kind === 'archive' && (<>
        <rect x="3" y="5" width="16" height="4" rx="1" stroke={c} strokeWidth="1.4" />
        <path d="M5 9 V18 H17 V9" stroke={c} strokeWidth="1.4" />
        <line x1="9" y1="13" x2="13" y2="13" stroke={c} strokeWidth="1.4" />
      </>)}
      {kind === 'shield' && (<>
        <path d="M11 3 L18 6 V11 c0 4-3 7-7 8 -4-1-7-4-7-8 V6 Z" stroke={c} strokeWidth="1.4" />
        <path d="M8 11 L10 13 L14 9" stroke={c} strokeWidth="1.4" />
      </>)}
    </svg>
  );
}

function Trust() {
  return (
    <section style={{ background: 'var(--ink-50)', padding: '96px 56px' }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="06 / trust"
          title="Author-grade by default."
          sub="Decisions you can defend, infrastructure you can audit, separation rules you can prove."
          align="left"
        />
        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}>
          {TRUST_ITEMS.map((t) => (
            <div key={t.title} style={{
              padding: 24,
              background: 'var(--ink-0)',
              border: '1px solid var(--ink-100)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'var(--ink-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}>
                <TrustGlyph kind={t.glyph} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-900)', marginBottom: 4 }}>
                {t.title}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-600)', textWrap: 'pretty' }}>
                {t.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ——— PRICING ——— */
const TIERS_PRIMARY = [
  {
    id: 'indie', name: 'Indie', price: 39,
    blurb: 'For solo authors holding their own canon.',
    tokens: '1M tokens / mo',
    features: ['1 IP project', 'Canon ledger + replay', 'Unlimited reviews', '30-day trial, no card'],
    cta: 'Start Indie',
    highlight: false,
  },
  {
    id: 'pro', name: 'Pro', price: 149,
    blurb: 'For pro authors and small studios shipping multiple IPs.',
    tokens: '5M tokens / mo',
    features: ['5 IP projects', 'Branch + diff canon', 'Priority conflict review', 'Team-of-3 collab', 'BYOK 50% off'],
    cta: 'Start Pro',
    highlight: true,
  },
];

const TIERS_SECONDARY = [
  {
    id: 'studio', name: 'Studio', price: '$499 / month', tokens: '20M tokens / mo',
    blurb: 'Multi-IP, multi-author. Audit log, role permissions, dedicated review queue.',
    cta: 'Start Studio',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'From $2,500 / month', tokens: 'Unlimited',
    blurb: 'Custom data residency, SSO, on-prem replay archive, premium SLA.',
    cta: 'Contact sales',
  },
];

function Pricing() {
  return (
    <section style={{ background: 'var(--ink-0)', padding: '96px 56px' }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="07 / pricing"
          title="Pay for the ledger, not the LLM."
          sub="BYOK halves the price and lifts the token cap. Yearly saves 15%. 30-day trial on every tier."
        />

        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
        }}>
          {TIERS_PRIMARY.map((t) => (
            <PricingCardPrimary key={t.id} t={t} />
          ))}
        </div>

        <div style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}>
          {TIERS_SECONDARY.map((t) => (
            <PricingRowSecondary key={t.id} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCardPrimary({ t }) {
  return (
    <div style={{
      padding: 32,
      background: t.highlight ? 'var(--ink-900)' : 'var(--ink-0)',
      color: t.highlight ? 'var(--ink-0)' : 'var(--ink-900)',
      border: t.highlight ? '1px solid var(--ink-900)' : '1px solid var(--ink-200)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: t.highlight ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      position: 'relative',
    }}>
      {t.highlight && (
        <span style={{
          position: 'absolute', top: 16, right: 16,
          padding: '3px 10px', borderRadius: 999,
          background: 'var(--signal-canon)', color: 'var(--ink-900)',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.06em', fontWeight: 500,
        }}>
          most picked
        </span>
      )}
      <div className="eyebrow" style={{ color: t.highlight ? 'oklch(1 0 0 / 0.55)' : 'var(--ink-500)', marginBottom: 12 }}>
        {t.tokens}
      </div>
      <h3 className="serif" style={{
        fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.015em',
      }}>
        {t.name}
      </h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>
          ${t.price}
        </span>
        <span style={{ fontSize: 14, color: t.highlight ? 'oklch(1 0 0 / 0.6)' : 'var(--ink-500)' }}>
          / month
        </span>
      </div>
      <p style={{
        fontSize: 14, lineHeight: 1.6, marginTop: 0, marginBottom: 22,
        color: t.highlight ? 'oklch(1 0 0 / 0.72)' : 'var(--ink-600)', textWrap: 'pretty',
      }}>
        {t.blurb}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {t.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: t.highlight ? 'oklch(1 0 0 / 0.85)' : 'var(--ink-700)' }}>
            <span style={{
              width: 16, height: 16, borderRadius: 999, flexShrink: 0,
              background: t.highlight ? 'oklch(1 0 0 / 0.1)' : 'var(--signal-canon-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 2,
            }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 4.5 L3.5 7 L8 1.5" stroke={t.highlight ? 'var(--signal-canon)' : 'var(--signal-canon-ink)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button className="btn" style={{
        width: '100%',
        background: t.highlight ? 'var(--ink-0)' : 'var(--ink-900)',
        color: t.highlight ? 'var(--ink-900)' : 'var(--ink-0)',
        padding: '13px 18px', justifyContent: 'center',
        fontWeight: 500,
      }}>
        {t.cta} &rarr;
      </button>
    </div>
  );
}

function PricingRowSecondary({ t }) {
  return (
    <div style={{
      padding: 20,
      background: 'var(--ink-50)',
      border: '1px solid var(--ink-100)',
      borderRadius: 'var(--radius-md)',
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ flexShrink: 0, minWidth: 90 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-900)' }}>{t.name}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3 }}>{t.tokens}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5, textWrap: 'pretty' }}>{t.blurb}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: 13, color: 'var(--ink-800)', marginBottom: 4 }}>{t.price}</div>
        <button style={{
          padding: '7px 14px',
          fontSize: 12,
          background: 'transparent',
          border: '1px solid var(--ink-300)',
          borderRadius: 6,
          color: 'var(--ink-800)',
          fontWeight: 500,
        }}>
          {t.cta} &rarr;
        </button>
      </div>
    </div>
  );
}

/* ——— FAQ ——— */
const FAQ_ITEMS = [
  { q: 'How is Seizn different from Sudowrite or NovelCrafter?', a: 'Seizn isn\u2019t a writing assistant. It\u2019s a canon ledger. We don\u2019t generate your prose; we hold your facts to the letter and surface every contradiction the moment it appears.' },
  { q: 'What does BYOK actually unlock?', a: 'Bring your own model key (Anthropic, OpenAI, etc.) and pay 50% of list price with unlimited tokens. You cover model usage at your own provider; we never hold a margin on the LLM call.' },
  { q: 'Can I export my canon?', a: 'Always. Every ledger exports as structured JSON, plain markdown, or DOCX. No lock-in. Cancel anytime and walk out with everything.' },
  { q: 'What happens to my manuscript?', a: 'Your work is isolated from sample IPs and from any public model training. The Saebyeok demo on this page is synthetic data, not a real customer.' },
  { q: 'Does the trial need a credit card?', a: 'No. 30 days, no card. After day 30, pick a tier or your project archives in read-only mode for another 60 days.' },
];

function FAQ() {
  return (
    <section style={{ background: 'var(--ink-50)', padding: '96px 56px' }}>
      <div style={{ maxWidth: 880, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="08 / faq"
          title="Five things authors ask first."
        />
        <div style={{ marginTop: 40, borderTop: '1px solid var(--ink-200)' }}>
          {FAQ_ITEMS.map((f, i) => (
            <details key={i} style={{
              borderBottom: '1px solid var(--ink-200)',
              padding: '20px 0',
            }}>
              <summary style={{
                listStyle: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16,
              }}>
                <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--ink-900)' }}>
                  {f.q}
                </span>
                <span className="mono" style={{
                  fontSize: 18, color: 'var(--ink-500)', flexShrink: 0,
                }}>+</span>
              </summary>
              <div style={{
                marginTop: 12, fontSize: 15, lineHeight: 1.65,
                color: 'var(--ink-600)', textWrap: 'pretty', maxWidth: 740,
              }}>
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ——— FOOTER ——— */
function Footer({ markVariant = 'graph' }) {
  return (
    <footer style={{
      background: 'var(--ink-900)', color: 'var(--ink-0)',
      padding: '64px 56px 40px',
    }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
          gap: 32, alignItems: 'start', paddingBottom: 48,
          borderBottom: '1px solid oklch(1 0 0 / 0.08)',
        }}>
          <div>
            <Lockup variant={markVariant} size="md" tone="light" />
            <p style={{
              marginTop: 16, fontSize: 14, lineHeight: 1.6,
              color: 'oklch(1 0 0 / 0.6)', maxWidth: 320,
            }}>
              Author memory, held to the letter. SFW-only. Built for canon authority.
            </p>
          </div>
          <FooterCol title="Product" links={['Workflow', 'Demo', 'Pricing', 'Docs']} />
          <FooterCol title="Company" links={['About', 'Trust + privacy', 'Status', 'Contact']} />
          <FooterCol title="Author tools" links={['Canon ledger', 'Replay', 'BYOK guide', 'Changelog']} />
        </div>
        <div style={{
          paddingTop: 24, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'oklch(1 0 0 / 0.45)' }}>
            &copy; 2026 Seizn by Litheon LLC &middot; Wyoming
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'oklch(1 0 0 / 0.45)' }}>
            v1.0 &middot; saebyeok demo is synthetic data
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: 'oklch(1 0 0 / 0.5)', marginBottom: 14 }}>{title}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((l) => (
          <li key={l}><a href="#" style={{ fontSize: 14, color: 'oklch(1 0 0 / 0.78)' }}>{l}</a></li>
        ))}
      </ul>
    </div>
  );
}

/* ——— ENGINE TEASE STRIP — env-gated, designed but hidden ——— */
function EngineTease() {
  return (
    <div style={{
      background: 'oklch(0.20 0.014 250)',
      borderTop: '1px solid oklch(1 0 0 / 0.08)',
      borderBottom: '1px solid oklch(1 0 0 / 0.08)',
      padding: '14px 56px',
      color: 'oklch(1 0 0 / 0.85)',
      fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="badge" style={{
          background: 'oklch(1 0 0 / 0.08)', color: 'var(--ink-0)',
          border: '1px solid oklch(1 0 0 / 0.12)', fontSize: 10,
        }}>
          <span className="badge-dot" style={{ background: 'var(--signal-canon)' }} />
          new
        </span>
        <span style={{ color: 'oklch(1 0 0 / 0.78)' }}>
          Building game NPC AI? The same canon engine, exposed as an SDK.
        </span>
      </div>
      <a href="#" className="mono" style={{
        fontSize: 12, color: 'var(--ink-0)', display: 'inline-flex', gap: 6, alignItems: 'center',
        padding: '6px 12px', borderRadius: 6,
        background: 'oklch(1 0 0 / 0.06)', border: '1px solid oklch(1 0 0 / 0.12)',
      }}>
        engine.seizn.com &rarr;
      </a>
    </div>
  );
}

window.Trust = Trust;
window.Pricing = Pricing;
window.FAQ = FAQ;
window.Footer = Footer;
window.EngineTease = EngineTease;
