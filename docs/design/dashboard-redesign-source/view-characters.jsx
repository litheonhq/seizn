// Seizn Author — Characters view (English master)

const CharRow = ({ c, selected, onClick }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '32px 1.4fr 0.9fr 60px 60px 80px 24px',
        alignItems: 'center', gap: 14, padding: '10px 18px', cursor: 'pointer',
        background: selected ? 'rgba(201,100,66,0.06)' : (hover ? 'var(--ink-25)' : 'transparent'),
        borderLeft: `2px solid ${selected ? 'var(--terracotta-500)' : 'transparent'}`,
        fontSize: 13,
      }}>
      <Avatar name={c.name} color={c.color} size={28}/>
      <div style={{ minWidth: 0 }}>
        <div className="serif" style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text-primary)',
          letterSpacing: '-0.012em' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.aka}</div>
      </div>
      <div>
        <Tag tone={c.role === 'Lead' ? 'terracotta' : c.role === 'Supporting' ? 'cream' : 'ink'} size="xs">{c.role}</Tag>
      </div>
      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12.5 }}>{c.episodes}</div>
      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12.5 }}>{c.relations}</div>
      <div>
        {c.conflicts > 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
            color: 'var(--terracotta-700)', fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--terracotta-500)' }}/>
            {c.conflicts}
          </span>
        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
      </div>
      <span style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end' }}>{I.chevRight}</span>
    </div>
  );
};

const CharDetailPanel = ({ c }) => (
  <div style={{
    width: 340, flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle)',
    background: 'var(--ink-25)',
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{
      padding: '20px 22px 14px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--ink-0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <Avatar name={c.name} color={c.color} size={48} ring/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 22, fontWeight: 500, fontStyle: 'italic',
            letterSpacing: '-0.018em', color: 'var(--text-primary)' }}>{c.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.aka}</div>
        </div>
        <button style={iconBtn}>{I.more}</button>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5 }}>
        {[
          { l: 'Episodes', v: c.episodes },
          { l: 'Relations', v: c.relations },
          { l: 'Conflicts', v: c.conflicts, accent: c.conflicts > 0 },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.l}</div>
            <div className="serif" style={{
              fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
              color: s.accent ? 'var(--terracotta-700)' : 'var(--text-primary)', marginTop: 2,
            }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
      <div style={sectionLabel}>Canon facts <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· 12</span></div>
      {[
        { ep: 'Ch. 1', text: 'Reporter at the Midnight Daily.' },
        { ep: 'Ch. 2', text: 'Younger brother, Minho, lives with her.' },
        { ep: 'Ch. 4', text: 'Three years on the precinct beat.' },
        { ep: 'Ch. 7', text: 'Identifies herself as a detective.', warn: true },
      ].map((f, i) => (
        <div key={i} style={{
          padding: '8px 10px', borderRadius: 8, marginBottom: 4,
          background: f.warn ? 'var(--terracotta-50)' : 'transparent',
          border: f.warn ? '1px solid rgba(201,100,66,.18)' : '1px solid transparent',
          display: 'flex', gap: 10,
        }}>
          <span className="mono" style={{ fontSize: 10.5, color: f.warn ? 'var(--terracotta-700)' : 'var(--text-muted)', flexShrink: 0, paddingTop: 2, minWidth: 38 }}>{f.ep}</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{f.text}</span>
        </div>
      ))}

      <div style={{ ...sectionLabel, marginTop: 18 }}>Relationships</div>
      {[
        { name: 'Doyoon', kind: 'Trust',  conflict: true,  color: '#7a5c3a' },
        { name: 'Jin',    kind: 'Mentor', conflict: false, color: '#8a6818' },
        { name: 'Minho',  kind: 'Family', conflict: false, color: '#4a4338' },
      ].map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
          borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <Avatar name={r.name} color={r.color} size={24}/>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{r.name}</span>
          <Tag tone={r.conflict ? 'terracotta' : 'ink'} size="xs">{r.kind}</Tag>
        </div>
      ))}
    </div>
  </div>
);

const sectionLabel = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
  color: 'var(--text-muted)', textTransform: 'uppercase',
  marginBottom: 8,
};

const CharactersView = () => {
  const [sel, setSel] = React.useState('seoyun');
  const c = MOCK.characters.find(x => x.id === sel);
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--ink-0)' }}>
        {/* Header */}
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span className="serif" style={{ fontSize: 19, fontWeight: 500, fontStyle: 'italic',
            letterSpacing: '-0.018em' }}>Characters</span>
          <Tag tone="cream" size="xs">{MOCK.characters.length}</Tag>
          <span style={{ flex: 1 }}/>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            background: 'var(--ink-25)', border: '1px solid var(--border-subtle)',
            borderRadius: 7, fontSize: 12, color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'flex' }}>{I.search}</span>
            <span>Filter characters</span>
          </div>
          <button style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'var(--ink-900)', color: 'var(--ink-25)',
            fontSize: 12.5, fontWeight: 600, borderRadius: 7,
          }}>{I.plus} Add character</button>
        </div>

        {/* Column header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 1.4fr 0.9fr 60px 60px 80px 24px',
          alignItems: 'center', gap: 14, padding: '8px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
          color: 'var(--text-muted)', textTransform: 'uppercase',
          background: 'var(--ink-25)',
        }}>
          <span/>
          <span>Name</span>
          <span>Role</span>
          <span style={{ textAlign: 'left' }}>Eps</span>
          <span style={{ textAlign: 'left' }}>Rel</span>
          <span>Conflicts</span>
          <span/>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {MOCK.characters.map(c => (
            <CharRow key={c.id} c={c} selected={c.id === sel} onClick={() => setSel(c.id)}/>
          ))}
          <div style={{
            display: 'grid', gridTemplateColumns: '32px 1fr',
            gap: 14, padding: '14px 18px', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13, alignItems: 'center',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1.5px dashed var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.plus}</div>
            <span>Add a character</span>
          </div>
        </div>
      </div>
      <CharDetailPanel c={c}/>
    </div>
  );
};

Object.assign(window, { CharactersView });
