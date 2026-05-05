// Seizn Author — Inbox view (English master)

const PriorityDot = ({ p }) => {
  const map = {
    P1: { bg: 'var(--terracotta-500)', ring: 'rgba(201,100,66,.20)' },
    P2: { bg: 'var(--dawn-500)',       ring: 'rgba(217,168,71,.20)' },
    P3: { bg: 'var(--ink-200)',        ring: 'rgba(74,67,56,.10)' },
  };
  const c = map[p] ?? map.P3;
  return <span style={{ width: 7, height: 7, borderRadius: 4, background: c.bg, boxShadow: `0 0 0 3px ${c.ring}`, flexShrink: 0 }}/>;
};

const InboxRow = ({ row, selected, onClick }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 18px', cursor: 'pointer',
        borderLeft: `2px solid ${selected ? 'var(--terracotta-500)' : 'transparent'}`,
        background: selected ? 'rgba(201,100,66,0.06)' : (hover ? 'var(--ink-25)' : 'transparent'),
        position: 'relative',
      }}
    >
      <div style={{ paddingTop: 5 }}><PriorityDot p={row.priority}/></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Tag tone={row.kind === 'Conflict' ? 'terracotta' : row.kind === 'Canon' ? 'dawn' : 'ink'} size="xs">
            {row.kind}
          </Tag>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{row.episode}</span>
          <span style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.time}</span>
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: row.unread ? 600 : 500,
          color: 'var(--text-primary)', lineHeight: 1.45,
          letterSpacing: '-0.005em',
        }}>{row.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>From</span>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{row.author}</span>
        </div>
      </div>
      {row.unread && (
        <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--terracotta-500)', marginTop: 6, flexShrink: 0 }}/>
      )}
    </div>
  );
};

// Detail pane — when a row is selected
const InboxDetail = ({ row }) => {
  if (!row) return null;
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'var(--ink-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Tag tone={row.kind === 'Conflict' ? 'terracotta' : row.kind === 'Canon' ? 'dawn' : 'ink'}>{row.kind}</Tag>
          <Tag tone="cream"><span className="mono" style={{ fontSize: 10.5 }}>{row.episode}</span></Tag>
          <PriorityDot p={row.priority}/>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Priority {row.priority}</span>
          <span style={{ flex: 1 }}/>
          <button style={iconBtn}>{I.bookmark}</button>
          <button style={iconBtn}>{I.more}</button>
        </div>
        <h2 className="serif" style={{
          fontSize: 22, fontWeight: 500, lineHeight: 1.25, margin: 0,
          color: 'var(--text-primary)', letterSpacing: '-0.018em',
        }}>{row.title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <Avatar name={row.author} color="#7a5c3a" size={22}/>
          <span style={{ fontWeight: 500 }}>{row.author}</span>
          <span>·</span>
          <span>{row.time}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, letterSpacing: '0.06em',
          color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10,
        }}>Evidence</div>
        <div style={{
          padding: 14, borderRadius: 10, background: 'var(--ink-25)',
          border: '1px solid var(--border-subtle)', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Ch. 4 · §3</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>recorded fact</span>
          </div>
          <p className="serif" style={{
            fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--text-primary)',
          }}>“Seoyun pulled out her press card. <mark style={{ background: 'rgba(217,168,71,.30)', padding: '0 2px', borderRadius: 2 }}>The journalist</mark> from the Daily had spent three years covering the precinct.”</p>
        </div>
        <div style={{
          padding: 14, borderRadius: 10, background: 'var(--terracotta-50)',
          border: '1px solid rgba(201,100,66,.20)', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--terracotta-700)' }}>Ch. 7 · §1</span>
            <span style={{ fontSize: 10.5, color: 'var(--terracotta-700)' }}>conflicting fact</span>
          </div>
          <p className="serif" style={{
            fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--text-primary)',
          }}>“<mark style={{ background: 'rgba(201,100,66,.20)', padding: '0 2px', borderRadius: 2 }}>Detective Seoyun</mark> badged the lobby officer and headed for the elevator.”</p>
        </div>

        <div style={{
          fontSize: 12.5, fontWeight: 600, letterSpacing: '0.06em',
          color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10,
        }}>Suggested resolution</div>
        <div style={{
          padding: '14px 16px', borderRadius: 10, background: 'var(--ink-0)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', color: 'var(--terracotta-500)' }}>{I.spark}</span>
            <span style={{ fontWeight: 600 }}>Memory v3 suggests</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>
            Update Ch. 7 §1 to <span className="serif" style={{ fontStyle: 'italic' }}>“Reporter Seoyun”</span>, or amend Seoyun’s canon entry to add a career change between Ch. 4 and Ch. 7.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{
              all: 'unset', cursor: 'pointer', padding: '7px 14px',
              background: 'var(--ink-900)', color: 'var(--ink-25)',
              borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            }}>Apply suggestion</button>
            <button style={{
              all: 'unset', cursor: 'pointer', padding: '7px 14px',
              border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
              borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            }}>Open in Ch. 7</button>
            <button style={{
              all: 'unset', cursor: 'pointer', padding: '7px 14px',
              color: 'var(--text-tertiary)', fontSize: 12.5, fontWeight: 500,
            }}>Mark not a conflict</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const InboxView = ({ density = 'comfortable' }) => {
  const [sel, setSel] = React.useState(MOCK.inbox[0].id);
  const row = MOCK.inbox.find(r => r.id === sel);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* Left list */}
      <div style={{
        width: 380, flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--ink-0)',
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="serif" style={{ fontSize: 17, fontWeight: 500, fontStyle: 'italic',
            letterSpacing: '-0.015em' }}>Inbox</span>
          <Tag tone="cream" size="xs">{MOCK.inbox.filter(r => r.unread).length} new</Tag>
          <span style={{ flex: 1 }}/>
          <button style={{ ...iconBtn, width: 28, height: 28 }}>{I.filter}</button>
          <button style={{ ...iconBtn, width: 28, height: 28 }}>{I.sort}</button>
        </div>
        <div style={{
          padding: '8px 18px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', gap: 6, fontSize: 12,
        }}>
          {[
            { l: 'All',        n: 7, active: true },
            { l: 'Conflicts',  n: 3 },
            { l: 'Reviews',    n: 2 },
            { l: 'Characters', n: 2 },
          ].map((f, i) => (
            <button key={i} style={{
              all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
              background: f.active ? 'var(--ink-900)' : 'transparent',
              color: f.active ? 'var(--ink-25)' : 'var(--text-tertiary)',
              fontWeight: f.active ? 600 : 500, fontSize: 11.5,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {f.l} <span style={{ opacity: .7 }}>{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {MOCK.inbox.map(r => (
            <InboxRow key={r.id} row={r} selected={r.id === sel} onClick={() => setSel(r.id)}/>
          ))}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 18px' }}/>
          <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
            Nothing older to show
          </div>
        </div>
      </div>

      {/* Detail */}
      <InboxDetail row={row}/>
    </div>
  );
};

Object.assign(window, { InboxView, PriorityDot });
