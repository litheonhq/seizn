// Seizn Author — TopBar (English master)

const TopBar = ({ variant = 'A', tab = 'inbox', onTab, density = 'comfortable', onToggleSidebar }) => {
  const tabs = [
    { id: 'inbox',      label: 'Inbox' },
    { id: 'characters', label: 'Characters' },
    { id: 'graph',      label: 'Graph' },
    { id: 'conflicts',  label: 'Conflicts' },
    { id: 'timeline',   label: 'Timeline' },
  ];
  const showTabs = variant === 'B';
  const h = density === 'compact' ? 48 : density === 'spacious' ? 60 : 54;
  const tabLabels = {
    inbox: 'Inbox', review: 'Review', characters: 'Characters', graph: 'Graph',
    timeline: 'Timeline', conflicts: 'Conflicts', simulate: 'Simulate', audit: 'Audit',
  };

  return (
    <header style={{
      height: h, flexShrink: 0,
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-elevated)',
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
    }}>
      <button onClick={onToggleSidebar} style={{
        all: 'unset', cursor: 'pointer', padding: 6, borderRadius: 6,
        color: 'var(--text-tertiary)', display: 'flex',
      }} title="Toggle sidebar">{I.panel}</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Workspace</span>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{I.chevRight}</span>
        <span className="serif" style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)',
          fontStyle: 'italic', letterSpacing: '-0.018em' }}>
          {tabLabels[tab] ?? 'Workspace'}
        </span>
      </div>

      {showTabs && (
        <nav style={{ display: 'flex', gap: 2, marginLeft: 12, height: '100%' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => onTab?.(t.id)}
              style={{
                all: 'unset', cursor: 'pointer', padding: '0 10px', height: '100%',
                display: 'flex', alignItems: 'center',
                fontSize: 12.5, fontWeight: tab === t.id ? 600 : 500,
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--terracotta-500)' : 'transparent'}`,
              }}>
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <div style={{ flex: 1 }}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
          fontSize: 12, color: 'var(--text-secondary)', borderRadius: 7,
          border: '1px solid var(--border-subtle)', background: 'var(--ink-25)',
        }}>
          <span style={{ display: 'flex' }}>{I.command}</span><span>Command</span> <KBD>⌘K</KBD>
        </button>
        <button style={iconBtn} title="Notifications">{I.bell}</button>
        <button style={{
          all: 'unset', cursor: 'pointer', marginLeft: 2,
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: 'var(--terracotta-500)', color: 'var(--ink-0)',
          fontSize: 12.5, fontWeight: 600, borderRadius: 7,
          boxShadow: '0 1px 2px rgba(201,100,66,.25)',
        }}>
          <span style={{ display: 'flex' }}>{I.feather}</span> <span>Write</span>
        </button>
      </div>
    </header>
  );
};

const iconBtn = {
  all: 'unset', cursor: 'pointer',
  width: 32, height: 32, borderRadius: 7,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-tertiary)',
};

Object.assign(window, { TopBar, iconBtn });
