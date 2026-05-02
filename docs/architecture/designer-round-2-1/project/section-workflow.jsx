/* global React */
const { useState: useStateW } = React;

/* ——————————————————————————————————————
   WORKFLOW SECTION (item T)
   Numbered horizontal flow — 3 steps equal weight
———————————————————————————————————————— */

const STEPS = [
  {
    n: '01',
    title: 'Import',
    sub: 'Bring your canon in.',
    body: 'Drop a manuscript, point at a Google Doc, or sync a worldbuilding wiki. Seizn parses characters, locations, and rules into a structured ledger.',
    chips: ['DOCX', 'Plain text', 'Google Docs', 'Native'],
  },
  {
    n: '02',
    title: 'Review',
    sub: 'Your verdict, recorded.',
    body: 'Every fact lands in the canon ledger with a verdict — accepted, queued, or in conflict. Your review becomes the source of truth, replayable on demand.',
    chips: ['canon · 142', 'pending · 8', 'conflict · 3'],
  },
  {
    n: '03',
    title: 'Write',
    sub: 'Draft inside the ledger.',
    body: 'Compose new scenes alongside the canon graph. Contradictions surface the moment they appear, with the offending rule cited and one click to override.',
    chips: ['Scene draft', 'Live check', 'Replay'],
  },
];

function Workflow() {
  return (
    <section style={{ background: 'var(--ink-0)', padding: '96px 56px' }}>
      <SectionHeader
        eyebrow="02 / workflow"
        title="Three steps. One ledger."
        sub="Import → Review → Write. The same canon backs every keystroke."
      />

      <div style={{ position: 'relative', marginTop: 56, maxWidth: 1240, marginInline: 'auto' }}>
        {/* horizontal line connecting steps */}
        <div style={{
          position: 'absolute', top: 32, left: '8.3%', right: '8.3%',
          height: 1, background: 'var(--ink-200)',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: -3, width: 7, height: 7,
            borderRadius: 999, background: 'var(--ink-300)',
          }} />
          <div style={{
            position: 'absolute', right: 0, top: -3, width: 7, height: 7,
            borderRadius: 999, background: 'var(--ink-300)',
          }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {STEPS.map((s, i) => (
            <WorkflowCard key={s.n} step={s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowCard({ step }) {
  return (
    <div style={{ position: 'relative' }}>
      {/* number disc on the line */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--ink-0)', border: '1px solid var(--ink-200)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500,
        color: 'var(--ink-700)',
        marginInline: 'auto', position: 'relative', zIndex: 2,
        boxShadow: '0 0 0 6px var(--ink-0)',
      }}>
        {step.n}
      </div>

      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <h3 className="serif" style={{
          fontSize: 28, margin: 0, color: 'var(--ink-900)',
          fontWeight: 400, letterSpacing: '-0.015em',
        }}>
          {step.title}
        </h3>
        <div className="mono" style={{
          fontSize: 12, color: 'var(--signal-canon-ink)',
          letterSpacing: '0.04em', marginTop: 6,
        }}>
          {step.sub}
        </div>
      </div>

      <p style={{
        marginTop: 16, fontSize: 14.5, lineHeight: 1.6,
        color: 'var(--ink-600)', textAlign: 'center', textWrap: 'pretty',
        maxWidth: 320, marginInline: 'auto',
      }}>
        {step.body}
      </p>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        justifyContent: 'center', marginTop: 18,
      }}>
        {step.chips.map((c) => (
          <span key={c} style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'var(--ink-50)', border: '1px solid var(--ink-100)',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--ink-600)',
          }}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ——————————————————————————————————————
   SECTION HEADER (reusable)
———————————————————————————————————————— */

function SectionHeader({ eyebrow, title, sub, tone = 'light', align = 'center' }) {
  const ink900 = tone === 'dark' ? 'var(--ink-0)' : 'var(--ink-900)';
  const ink500 = tone === 'dark' ? 'oklch(1 0 0 / 0.62)' : 'var(--ink-500)';
  const eyebrowColor = tone === 'dark' ? 'oklch(1 0 0 / 0.55)' : 'var(--ink-500)';
  return (
    <div style={{ textAlign: align, maxWidth: 720, marginInline: align === 'center' ? 'auto' : 0 }}>
      {eyebrow && (
        <div className="eyebrow" style={{ color: eyebrowColor, marginBottom: 16 }}>
          {eyebrow}
        </div>
      )}
      <h2 className="serif" style={{
        fontSize: 'var(--t-h2)', margin: 0, color: ink900,
        fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.1,
      }}>
        {title}
      </h2>
      {sub && (
        <p style={{
          marginTop: 14, fontSize: 17, lineHeight: 1.55,
          color: ink500, textWrap: 'pretty',
        }}>
          {sub}
        </p>
      )}
    </div>
  );
}

window.Workflow = Workflow;
window.SectionHeader = SectionHeader;
