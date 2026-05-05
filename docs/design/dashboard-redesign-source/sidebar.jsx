// Seizn Author — Sidebar (English master)

const NAV = {
  workspace: [
    { id: 'inbox',      label: 'Inbox',      icon: I.inbox,      badge: 7, kbd: 'I' },
    { id: 'review',     label: 'Review',     icon: I.review,     badge: 3, kbd: 'R' },
    { id: 'characters', label: 'Characters', icon: I.characters, badge: 7, kbd: 'C' },
    { id: 'graph',      label: 'Graph',      icon: I.graph,                kbd: 'G' },
    { id: 'timeline',   label: 'Timeline',   icon: I.timeline,             kbd: 'T' },
    { id: 'conflicts',  label: 'Conflicts',  icon: I.conflict,   badge: 5, dot: 'p1', kbd: 'X' },
    { id: 'simulate',   label: 'Simulate',   icon: I.simulate,             kbd: 'S' },
    { id: 'audit',      label: 'Audit',      icon: I.audit,                kbd: 'A' },
  ],
  memory: [
    { id: 'memories',     label: 'Memories',      icon: I.brain },
    { id: 'memory-edit',  label: 'Memory editor', icon: I.edit },
    { id: 'mindmap',      label: 'Mind map',      icon: I.map },
    { id: 'replay',       label: 'Replay',        icon: I.replay },
  ],
  account: [
    { id: 'usage',    label: 'Usage',     icon: I.usage },
    { id: 'byok',     label: 'BYOK',      icon: I.byok },
    { id: 'settings', label: 'Settings',  icon: I.settings },
  ],
};

const SidebarItem = ({ item, active, collapsed, onClick, density = 'comfortable' }) => {
  const [hover, setHover] = React.useState(false);
  const padY = density === 'compact' ? 4 : density === 'spacious' ? 8 : 6;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '8px' : `${padY}px 10px`,
        margin: collapsed ? '2px 0' : '1px 6px',
        borderRadius: 8, cursor: 'pointer',
        background: active ? 'rgba(201,100,66,0.10)' : (hover ? 'rgba(74,67,56,0.05)' : 'transparent'),
        color: active ? 'var(--terracotta-700)' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: active ? 600 : 500,
        position: 'relative', transition: 'background .12s, color .12s',
      }}
      title={collapsed ? item.label : undefined}
    >
      {active && !collapsed && (
        <span style={{ position: 'absolute', left: -6, top: 6, bottom: 6, width: 2.5,
          borderRadius: 2, background: 'var(--terracotta-500)' }}/>
      )}
      <span style={{ display: 'flex', color: active ? 'var(--terracotta-500)' : 'var(--text-tertiary)' }}>
        {item.icon}
      </span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, letterSpacing: '-0.005em' }}>{item.label}</span>
          {item.dot === 'p1' && (
            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--terracotta-500)' }}/>
          )}
          {item.badge != null && (
            <span style={{
              fontSize: 10.5, fontVariantNumeric: 'tabular-nums', fontWeight: 500,
              color: active ? 'var(--terracotta-700)' : 'var(--text-muted)',
              minWidth: 16, textAlign: 'right',
            }}>{item.badge}</span>
          )}
          {hover && item.kbd && item.badge == null && (
            <KBD style={{ fontSize: 9.5, padding: '0 4px' }}>{item.kbd}</KBD>
          )}
        </>
      )}
    </button>
  );
};

const SidebarGroup = ({ label, children, collapsed }) => {
  if (collapsed) {
    return (
      <div style={{ padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 0 4px' }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.10em',
        color: 'var(--text-muted)', padding: '4px 16px 4px', textTransform: 'uppercase',
      }}>{label}</div>
      {children}
    </div>
  );
};

const WorkspaceSwitcher = ({ collapsed }) => (
  <div style={{
    margin: collapsed ? '12px 8px' : '12px',
    padding: collapsed ? 0 : '10px 12px',
    borderRadius: 10,
    background: collapsed ? 'transparent' : 'var(--ink-25)',
    border: collapsed ? 'none' : '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }}>
    <div style={{
      width: collapsed ? 32 : 28, height: collapsed ? 32 : 28, borderRadius: 8,
      background: 'linear-gradient(135deg, var(--ink-900), var(--ink-700))',
      color: 'var(--ink-25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-serif)', fontSize: collapsed ? 16 : 14, fontWeight: 500, fontStyle: 'italic',
      flexShrink: 0,
    }}>S</div>
    {!collapsed && (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="serif" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.012em' }}>
          {MOCK.workspace.name}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>Studio</span>
          <span style={{ width: 2, height: 2, borderRadius: 1, background: 'currentColor', opacity: .5 }}/>
          <span>{MOCK.workspace.episodes} entries</span>
        </div>
      </div>
    )}
    {!collapsed && <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{I.chevDown}</span>}
  </div>
);

const UserCard = ({ collapsed }) => (
  <div style={{
    margin: collapsed ? '8px 8px 12px' : '8px 12px 12px',
    padding: collapsed ? 0 : '8px 10px',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', cursor: 'pointer',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }}>
    <Avatar name="M" color="#a94e2f" size={collapsed ? 30 : 26}/>
    {!collapsed && (
      <>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Min Lee</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Indie · Author</div>
        </div>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{I.more}</span>
      </>
    )}
  </div>
);

const MemoryHealth = ({ collapsed }) => (
  <div style={{
    margin: collapsed ? '0 8px 8px' : '0 12px 8px',
    padding: collapsed ? '8px 0' : '10px 12px',
    borderRadius: 10,
    background: 'var(--ink-25)',
    border: '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'center', gap: 8,
    justifyContent: collapsed ? 'center' : 'flex-start',
  }}>
    <span className="dot-live" style={{
      width: 7, height: 7, borderRadius: 4,
      background: 'oklch(0.65 0.13 145)',
      boxShadow: '0 0 0 2px oklch(0.65 0.13 145 / 0.15)', flexShrink: 0,
    }}/>
    {!collapsed && (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>Memory synced</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>just now · 1,284 facts</div>
      </div>
    )}
  </div>
);

const Sidebar = ({ active = 'inbox', onNav, collapsed = false, density = 'comfortable' }) => (
  <aside style={{
    width: collapsed ? 56 : 232, flexShrink: 0,
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', height: '100%',
    transition: 'width .2s ease',
  }}>
    <WorkspaceSwitcher collapsed={collapsed}/>
    {!collapsed && (
      <div style={{ padding: '0 12px 4px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          background: 'var(--ink-0)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'text',
        }}>
          <span style={{ display: 'flex' }}>{I.search}</span>
          <span style={{ flex: 1 }}>Search</span>
          <KBD style={{ fontSize: 9.5 }}>⌘K</KBD>
        </div>
      </div>
    )}
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
      <SidebarGroup label="Workspace" collapsed={collapsed}>
        {NAV.workspace.map(item =>
          <SidebarItem key={item.id} item={item} collapsed={collapsed} density={density}
            active={active === item.id} onClick={() => onNav?.(item.id)}/>)}
      </SidebarGroup>
      <SidebarGroup label="Memory" collapsed={collapsed}>
        {NAV.memory.map(item =>
          <SidebarItem key={item.id} item={item} collapsed={collapsed} density={density}
            active={active === item.id} onClick={() => onNav?.(item.id)}/>)}
      </SidebarGroup>
      <SidebarGroup label="Account" collapsed={collapsed}>
        {NAV.account.map(item =>
          <SidebarItem key={item.id} item={item} collapsed={collapsed} density={density}
            active={active === item.id} onClick={() => onNav?.(item.id)}/>)}
      </SidebarGroup>
    </div>
    <MemoryHealth collapsed={collapsed}/>
    <UserCard collapsed={collapsed}/>
  </aside>
);

Object.assign(window, { Sidebar, NAV });
