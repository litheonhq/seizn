/* global React, CanonGraph */

/* ——————————————————————————————————————
   CONFLICTS SECTION — dark, severity-graded card list
———————————————————————————————————————— */

const CONFLICTS = [
  {
    sev: 'critical',
    rule: 'character.han_iseul.eye_color',
    fact: 'Chapter 11 — Han Iseul has gray eyes.',
    against: 'Canon (chapter 2): brown.',
    cited: ['scene.2.1', 'character.han_iseul'],
  },
  {
    sev: 'major',
    rule: 'rule.r03 — rooftop access',
    fact: 'Chapter 7 — Park Jio enters the rooftop on day 9.',
    against: 'Rule r03: locked until day 14.',
    cited: ['rule.r03', 'scene.7.4'],
  },
  {
    sev: 'minor',
    rule: 'character.yun_hana.club',
    fact: 'Chapter 18 — Yun Hana attends astronomy club.',
    against: 'Canon: photo club. May be a transfer event.',
    cited: ['character.yun_hana'],
  },
];

const SEV_COLOR = {
  critical: { bg: 'var(--signal-conflict)', soft: 'oklch(0.40 0.18 27)', label: 'critical' },
  major: { bg: 'var(--signal-pending)', soft: 'oklch(0.45 0.13 75)', label: 'major' },
  minor: { bg: 'oklch(0.65 0.10 200)', soft: 'oklch(0.40 0.08 220)', label: 'minor' },
};

function Conflicts() {
  return (
    <section style={{ background: 'var(--ink-900)', padding: '96px 56px', color: 'var(--ink-0)' }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="04 / conflicts"
          title="Every contradiction, cited and ranked."
          sub="Severity is signal, not noise. Critical breaks canon outright. Minor flags a soft drift you may want to keep."
          tone="dark"
          align="left"
        />

        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 40,
          alignItems: 'start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CONFLICTS.map((c, i) => (
              <ConflictCard key={i} c={c} />
            ))}
          </div>

          <div style={{ position: 'sticky', top: 24 }}>
            <CanonGraph tone="dark" width={560} height={460} animate={false} />
            <div style={{
              marginTop: 14, fontSize: 13,
              color: 'oklch(1 0 0 / 0.6)', lineHeight: 1.5,
            }}>
              The graph isn\u2019t cosmetic. Every conflict points to the exact node and edge that broke. One click jumps you there.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConflictCard({ c }) {
  const sev = SEV_COLOR[c.sev];
  return (
    <div style={{
      padding: 22,
      background: 'oklch(0.20 0.014 250)',
      border: '1px solid oklch(1 0 0 / 0.08)',
      borderLeft: `3px solid ${sev.bg}`,
      borderRadius: 'var(--radius-md)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          padding: '3px 10px', borderRadius: 999,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
          background: sev.soft, color: 'var(--ink-0)',
        }}>
          {sev.label}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'oklch(1 0 0 / 0.55)' }}>
          {c.rule}
        </span>
      </div>
      <div style={{ fontSize: 15.5, color: 'var(--ink-0)', lineHeight: 1.5, marginBottom: 6 }}>
        {c.fact}
      </div>
      <div style={{ fontSize: 13.5, color: 'oklch(1 0 0 / 0.65)', lineHeight: 1.55, marginBottom: 12 }}>
        {c.against}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {c.cited.map((id) => (
          <span key={id} className="mono" style={{
            padding: '3px 8px', borderRadius: 4,
            background: 'oklch(1 0 0 / 0.06)', border: '1px solid oklch(1 0 0 / 0.08)',
            fontSize: 10, color: 'oklch(1 0 0 / 0.7)',
          }}>
            \u2197 {id}
          </span>
        ))}
      </div>
    </div>
  );
}

window.Conflicts = Conflicts;
