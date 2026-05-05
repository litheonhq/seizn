// Seizn Author — Tweaks panel + Workspace shell

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "sidebarCollapsed": false,
  "density": "comfortable",
  "accent": "medium",
  "emptyTone": "friendly"
}/*EDITMODE-END*/;

const useTweaks = () => {
  const [t, setT] = React.useState(TWEAKS_DEFAULTS);
  const set = (k, v) => {
    const next = typeof k === 'object' ? { ...t, ...k } : { ...t, [k]: v };
    setT(next);
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys',
        edits: typeof k === 'object' ? k : { [k]: v } }, '*');
    } catch (e) {}
  };
  return [t, set];
};

const TweaksPanel = ({ tweaks, setTweak, onClose }) => (
  <div style={{
    position: 'fixed', right: 16, bottom: 16, width: 280, zIndex: 100,
    background: 'var(--ink-0)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, boxShadow: 'var(--shadow-pop)', padding: 14,
    fontFamily: 'var(--font-sans)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
      <span className="serif" style={{ fontSize: 15, fontWeight: 500, fontStyle: 'italic' }}>Tweaks</span>
      <span style={{ flex: 1 }}/>
      <button onClick={onClose} style={{ ...iconBtn, width: 24, height: 24 }}>{I.x}</button>
    </div>

    <TweakRow label="Sidebar">
      <Seg value={tweaks.sidebarCollapsed ? 'col' : 'exp'}
        onChange={v => setTweak('sidebarCollapsed', v === 'col')}
        options={[{ id: 'exp', l: 'Expanded' }, { id: 'col', l: 'Collapsed' }]}/>
    </TweakRow>
    <TweakRow label="Density">
      <Seg value={tweaks.density} onChange={v => setTweak('density', v)}
        options={[{ id: 'compact', l: 'Compact' }, { id: 'comfortable', l: 'Comfort' }, { id: 'spacious', l: 'Spacious' }]}/>
    </TweakRow>
    <TweakRow label="Accent">
      <Seg value={tweaks.accent} onChange={v => setTweak('accent', v)}
        options={[{ id: 'minimal', l: 'Min' }, { id: 'medium', l: 'Med' }, { id: 'generous', l: 'Gen' }]}/>
    </TweakRow>
    <TweakRow label="Empty tone">
      <Seg value={tweaks.emptyTone} onChange={v => setTweak('emptyTone', v)}
        options={[{ id: 'friendly', l: 'Friendly' }, { id: 'instructional', l: 'Instr.' }, { id: 'minimal', l: 'Minimal' }]}/>
    </TweakRow>
  </div>
);

const TweakRow = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
    {children}
  </div>
);
const Seg = ({ value, onChange, options }) => (
  <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8,
    background: 'var(--ink-25)', border: '1px solid var(--border-subtle)' }}>
    {options.map(o => (
      <button key={o.id} onClick={() => onChange(o.id)} style={{
        all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
        padding: '4px 6px', borderRadius: 6, fontSize: 11, fontWeight: 500,
        background: value === o.id ? 'var(--ink-0)' : 'transparent',
        color: value === o.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
        boxShadow: value === o.id ? '0 1px 2px rgba(26,22,18,.06)' : 'none',
      }}>{o.l}</button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────
// WorkspaceShell — composes Sidebar + TopBar + active view
// ─────────────────────────────────────────────────────────────
const WorkspaceShell = ({ width = 1240, height = 820, defaultTab = 'inbox', collapsed: collapsedProp, density = 'comfortable' }) => {
  const [tab, setTab] = React.useState(defaultTab);
  const [collapsed, setCollapsed] = React.useState(!!collapsedProp);
  React.useEffect(() => { if (collapsedProp != null) setCollapsed(collapsedProp); }, [collapsedProp]);

  const view = (() => {
    if (tab === 'inbox') return <InboxView density={density}/>;
    if (tab === 'characters') return <CharactersView/>;
    if (tab === 'graph') return <GraphView/>;
    if (tab === 'conflicts') return <ConflictsView/>;
    if (tab === 'simulate') return <SimulateEmpty/>;
    return <FallbackView tab={tab}/>;
  })();

  return (
    <div className="seizn paper-bg" style={{
      width, height, display: 'flex', overflow: 'hidden',
      borderRadius: 14, border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-card)',
    }}>
      <Sidebar active={tab} onNav={setTab} collapsed={collapsed} density={density}/>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar tab={tab} onTab={setTab} density={density}
          onToggleSidebar={() => setCollapsed(c => !c)}/>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
          {view}
        </div>
      </div>
    </div>
  );
};

// Lightweight Conflicts view — uses the polished card
const ConflictsView = () => (
  <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--ink-25)' }}>
    <div style={{
      padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink-0)',
    }}>
      <span className="serif" style={{ fontSize: 19, fontWeight: 500, fontStyle: 'italic',
        letterSpacing: '-0.018em' }}>Conflicts</span>
      <Tag tone="terracotta" size="xs">3 critical</Tag>
      <Tag tone="dawn" size="xs">2 warning</Tag>
    </div>
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
      <ConflictCard severity="P1" kind="Character" episode="Ch. 7"
        title="Seoyun’s profession contradicts Ch. 4 canon"
        why="In Ch. 4 §3 Seoyun is established as a reporter. In Ch. 7 §1 she identifies as a detective with no transition recorded."
        refs={['canon/seoyun#profession', 'ep4§3', 'ep7§1']}/>
      <ConflictCard severity="P2" kind="Conflict" episode="Ch. 7"
        title="Doyoon ↔ Seoyun trust recovery lacks setup"
        why="Their bond visibly recovers in Ch. 6’s closing scene, but the prior friction never resolves on-page."
        refs={['ties/doyoon-seoyun', 'ep6§4']}/>
      <ConflictCard severity="P1" kind="Canon" episode="Ch. 6"
        title="“Midnight bells” ritual order conflicts between Ch. 4 and Ch. 6"
        why="Ch. 4 places the bells before the speech; Ch. 6 has them after. Pick a canonical sequence."
        refs={['canon/rituals#midnight-bells']}/>
      <ConflictCard severity="P2" kind="Timeline" episode="Ch. 5"
        title="Minho recovery: 12 days vs medical reference 4–6 weeks"
        refs={['timeline/minho', 'ep5§2']}/>
      <ConflictCard severity="P3" kind="Note" episode="Ch. 8 draft"
        title="Mrs. Han’s appearance contradicts Ch. 1 absent-mother setup"
        refs={['canon/yeonsu#family']}/>
    </div>
  </div>
);

const SimulateEmpty = () => (
  <div style={{ flex: 1, background: 'var(--ink-0)' }}>
    <EmptyState kind="graph"
      title="Run your first scene simulation"
      body="Drop two characters and a beat. We replay how they’d react against your canon — useful before you commit a scene to draft."
      primary="Set up a simulation"
      hints={[{ k: '⌘ N', t: 'New simulation' }, { k: '?', t: 'How simulations work' }]}/>
  </div>
);

const FallbackView = ({ tab }) => (
  <div style={{ flex: 1, background: 'var(--ink-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ textAlign: 'center' }}>
      <div className="serif" style={{ fontSize: 24, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>{tab}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>This tab uses the same shell pattern.</div>
    </div>
  </div>
);

Object.assign(window, { WorkspaceShell, TweaksPanel, useTweaks, TWEAKS_DEFAULTS,
  ConflictsView, SimulateEmpty });
