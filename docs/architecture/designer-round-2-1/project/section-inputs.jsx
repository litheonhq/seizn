/* global React */
const { useState: useStateIn } = React;

/* ——————————————————————————————————————
   INPUTS SECTION
   4 modes: Native · DOCX · Plain text · Google Docs
———————————————————————————————————————— */

const MODES = [
  {
    id: 'native',
    name: 'Native editor',
    sub: 'Author inside Seizn.',
    body: 'Write directly in the canon-aware editor. Every paragraph is checked against the ledger as you type.',
    glyph: 'native',
  },
  {
    id: 'docx',
    name: 'DOCX import',
    sub: 'Bring a manuscript.',
    body: 'Drag in a .docx, .rtf, or .odt file. Seizn extracts characters, scenes, and dialogue into the ledger.',
    glyph: 'docx',
  },
  {
    id: 'plain',
    name: 'Plain text',
    sub: 'Markdown-friendly.',
    body: 'Paste or upload .md and .txt. Headings become scenes; mentions become entities. Round-trip is lossless.',
    glyph: 'plain',
  },
  {
    id: 'gdocs',
    name: 'Google Docs',
    sub: 'Sync, don\u2019t copy.',
    body: 'Connect a Doc once. Seizn keeps the ledger in sync and surfaces conflicts as comment threads.',
    glyph: 'gdocs',
  },
];

function Inputs() {
  const [active, setActive] = useStateIn('docx');
  const mode = MODES.find((m) => m.id === active);

  return (
    <section style={{ background: 'var(--ink-50)', padding: '96px 56px' }}>
      <div style={{ maxWidth: 1240, marginInline: 'auto' }}>
        <SectionHeader
          eyebrow="03 / inputs"
          title="Meet your work where it lives."
          sub="Four ingest modes. Same ledger, same review, same canon."
          align="left"
        />

        <div style={{
          marginTop: 56,
          display: 'grid',
          gridTemplateColumns: '1fr 1.1fr',
          gap: 48,
          alignItems: 'start',
        }}>
          {/* Left: tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MODES.map((m) => {
              const isActive = active === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActive(m.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 16,
                    padding: '20px 22px',
                    background: isActive ? 'var(--ink-0)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--ink-200)' : 'transparent'}`,
                    borderRadius: 'var(--radius-md)',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 160ms ease, border-color 160ms ease',
                  }}
                >
                  <ModeGlyph kind={m.glyph} active={isActive} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 16, fontWeight: 500,
                      color: isActive ? 'var(--ink-900)' : 'var(--ink-700)',
                    }}>
                      {m.name}
                    </div>
                    <div className="mono" style={{
                      fontSize: 11, color: 'var(--ink-500)',
                      letterSpacing: '0.04em', marginTop: 3,
                    }}>
                      {m.sub}
                    </div>
                  </div>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: isActive ? 'var(--signal-canon)' : 'transparent',
                    marginTop: 8,
                  }} />
                </button>
              );
            })}
          </div>

          {/* Right: preview */}
          <div style={{
            background: 'var(--ink-0)',
            border: '1px solid var(--ink-100)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
            minHeight: 420,
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--ink-100)',
              background: 'var(--ink-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-700)' }}>
                {mode.id}.preview
              </span>
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                synthetic demo data
              </span>
            </div>
            <div style={{ padding: 28 }}>
              <h3 className="serif" style={{
                fontSize: 26, margin: 0, color: 'var(--ink-900)',
                fontWeight: 400, letterSpacing: '-0.015em',
              }}>
                {mode.name}
              </h3>
              <p style={{
                marginTop: 12, fontSize: 15, lineHeight: 1.6,
                color: 'var(--ink-600)', textWrap: 'pretty',
              }}>
                {mode.body}
              </p>

              <ModePreviewBody kind={mode.glyph} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeGlyph({ kind, active }) {
  const c = active ? 'var(--ink-900)' : 'var(--ink-500)';
  const bg = active ? 'var(--signal-canon-soft)' : 'var(--ink-100)';
  return (
    <span style={{
      width: 36, height: 36, borderRadius: 8,
      background: bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        {kind === 'native' && (
          <>
            <rect x="2" y="3" width="14" height="12" rx="1.5" stroke={c} strokeWidth="1.4" />
            <line x1="5" y1="7" x2="13" y2="7" stroke={c} strokeWidth="1.4" />
            <line x1="5" y1="10" x2="11" y2="10" stroke={c} strokeWidth="1.4" />
          </>
        )}
        {kind === 'docx' && (
          <>
            <path d="M4 2 H10 L14 6 V16 H4 Z" stroke={c} strokeWidth="1.4" fill="none" />
            <path d="M10 2 V6 H14" stroke={c} strokeWidth="1.4" fill="none" />
          </>
        )}
        {kind === 'plain' && (
          <>
            <line x1="3" y1="5" x2="15" y2="5" stroke={c} strokeWidth="1.4" />
            <line x1="3" y1="9" x2="13" y2="9" stroke={c} strokeWidth="1.4" />
            <line x1="3" y1="13" x2="11" y2="13" stroke={c} strokeWidth="1.4" />
          </>
        )}
        {kind === 'gdocs' && (
          <>
            <circle cx="9" cy="9" r="6" stroke={c} strokeWidth="1.4" fill="none" />
            <path d="M9 4 V9 L12 11" stroke={c} strokeWidth="1.4" />
          </>
        )}
      </svg>
    </span>
  );
}

function ModePreviewBody({ kind }) {
  if (kind === 'native') {
    return (
      <div style={{ marginTop: 24, padding: 18, background: 'var(--ink-50)', borderRadius: 8, border: '1px solid var(--ink-100)' }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 8 }}>
          scene 14 \u00b7 the observatory
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-800)' }}>
          Han Iseul climbed the rooftop on day 9.{' '}
          <span style={{
            background: 'var(--signal-conflict-soft)',
            color: 'var(--signal-conflict-ink)',
            padding: '1px 6px', borderRadius: 4,
            borderBottom: '1.5px wavy var(--signal-conflict)',
          }}>
            rooftop locked until day 14
          </span>
        </div>
      </div>
    );
  }
  if (kind === 'docx') {
    return (
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PreviewRow file="manuscript_v3.docx" status="parsed" detail="142 facts \u00b7 8 chars \u00b7 22 rules" />
        <PreviewRow file="appendix_lore.docx" status="parsed" detail="36 facts \u00b7 3 rules" />
        <PreviewRow file="character_bible.rtf" status="conflicts" detail="3 conflicts in canon" />
      </div>
    );
  }
  if (kind === 'plain') {
    return (
      <div style={{ marginTop: 24, padding: 16, background: 'var(--ink-900)', borderRadius: 8, color: 'oklch(1 0 0 / 0.85)' }}>
        <div className="mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: 'oklch(1 0 0 / 0.45)' }}># scene-14-observatory.md</div>
          <div style={{ marginTop: 6 }}>## The Observatory</div>
          <div style={{ color: 'oklch(1 0 0 / 0.6)' }}>characters: [han_iseul, jeong_serin]</div>
          <div style={{ color: 'oklch(1 0 0 / 0.6)' }}>day: 14</div>
          <div style={{ marginTop: 6 }}>The eclipse begins on schedule. <span style={{ color: 'var(--signal-canon)' }}>\u2713</span></div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 24, padding: 16, background: 'var(--ink-50)', borderRadius: 8, border: '1px solid var(--ink-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--signal-canon)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)' }}>saebyeok-draft.gdoc</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-500)', marginLeft: 'auto' }}>synced 2s ago</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.5 }}>
        3 new comments on canon-conflicts thread \u00b7 2 resolved by author
      </div>
    </div>
  );
}

function PreviewRow({ file, status, detail }) {
  const isConflict = status === 'conflicts';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: 'var(--ink-50)', border: '1px solid var(--ink-100)',
      borderRadius: 8,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: 999,
        background: isConflict ? 'var(--signal-conflict)' : 'var(--signal-canon)',
      }} />
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 12, color: 'var(--ink-800)' }}>{file}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{detail}</div>
      </div>
      <span className={`badge badge-${isConflict ? 'conflict' : 'canon'}`} style={{ fontSize: 10 }}>
        {status}
      </span>
    </div>
  );
}

window.Inputs = Inputs;
