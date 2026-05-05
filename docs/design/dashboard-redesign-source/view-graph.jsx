// Seizn Author — Graph view (relationship graph polish)

const GraphView = () => {
  const [sel, setSel] = React.useState('seoyun');
  const [hover, setHover] = React.useState(null);

  const W = 580, H = 380;
  const node = (id) => MOCK.graphNodes.find(n => n.id === id);

  const colorForRole = (r) =>
    r === 'Lead' ? '#c96442' : r === 'Supporting' ? '#7a5c3a' : '#bfb39a';

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--ink-0)' }}>
        {/* Header */}
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span className="serif" style={{ fontSize: 19, fontWeight: 500, fontStyle: 'italic',
            letterSpacing: '-0.018em' }}>Relationship graph</span>
          <Tag tone="cream" size="xs">7 characters · 7 ties</Tag>
          <span style={{ flex: 1 }}/>
          <div style={{ display: 'flex', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {['Force', 'Radial', 'Hierarchy'].map((m, i) => (
              <button key={i} style={{
                all: 'unset', cursor: 'pointer', padding: '4px 10px',
                borderRadius: 6, fontSize: 12,
                background: i === 0 ? 'var(--ink-25)' : 'transparent',
                color: i === 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontWeight: i === 0 ? 600 : 500,
                border: i === 0 ? '1px solid var(--border-subtle)' : '1px solid transparent',
              }}>{m}</button>
            ))}
          </div>
          <button style={{ ...iconBtn, width: 30, height: 30 }}>{I.filter}</button>
        </div>

        {/* Canvas */}
        <div style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: `
            radial-gradient(900px 500px at 30% 30%, rgba(217,168,71,.04), transparent 60%),
            radial-gradient(700px 400px at 80% 80%, rgba(201,100,66,.04), transparent 60%),
            var(--ink-25)
          `,
          backgroundImage: `
            radial-gradient(rgba(74,67,56,.08) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0',
        }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(74,67,56,.45)"/>
              </marker>
            </defs>

            {/* Edges */}
            {MOCK.graphEdges.map((e, i) => {
              const a = node(e.a), b = node(e.b);
              if (!a || !b) return null;
              const isSel = sel && (e.a === sel || e.b === sel);
              const stroke = e.conflict ? 'var(--terracotta-500)' : 'rgba(74,67,56,.35)';
              const dash = e.conflict ? '4 3' : 'none';
              const opacity = sel ? (isSel ? 1 : 0.25) : 0.7;
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              const lw = 1 + e.strength * 1.5;
              return (
                <g key={i} style={{ opacity, transition: 'opacity .2s' }}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={stroke} strokeWidth={lw} strokeDasharray={dash}
                    strokeLinecap="round"/>
                  {(isSel || hover === i) && (
                    <g>
                      <rect x={mid.x - 26} y={mid.y - 9} width={52} height={18} rx={9}
                        fill="var(--ink-0)" stroke="var(--border-subtle)"/>
                      <text x={mid.x} y={mid.y + 3.5} textAnchor="middle"
                        fontSize="10.5" fontWeight="600"
                        fill={e.conflict ? 'var(--terracotta-700)' : 'var(--text-secondary)'}
                        style={{ fontFamily: 'var(--font-sans)' }}>{e.kind}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {MOCK.graphNodes.map(n => {
              const isSel = sel === n.id;
              const isFaded = sel && !isSel && !MOCK.graphEdges.some(e =>
                (e.a === sel && e.b === n.id) || (e.b === sel && e.a === n.id));
              const fill = colorForRole(n.role);
              return (
                <g key={n.id} onClick={() => setSel(n.id)} style={{
                  cursor: 'pointer', opacity: isFaded ? 0.35 : 1,
                  transition: 'opacity .2s, transform .2s',
                }}>
                  {isSel && (
                    <circle cx={n.x} cy={n.y} r={n.r + 6}
                      fill="none" stroke={fill} strokeWidth="1.5" opacity="0.4"/>
                  )}
                  <circle cx={n.x} cy={n.y} r={n.r} fill={fill}
                    stroke="var(--ink-0)" strokeWidth={isSel ? 3 : 2}/>
                  <text x={n.x} y={n.y + 4} textAnchor="middle"
                    fontSize={n.r > 30 ? 14 : 11} fontWeight="600" fill="#fff"
                    fontStyle="italic"
                    style={{ fontFamily: 'var(--font-serif)', pointerEvents: 'none' }}>
                    {n.label.charAt(0)}
                  </text>
                  <text x={n.x} y={n.y + n.r + 14} textAnchor="middle"
                    fontSize="11" fontWeight="500"
                    fill="var(--text-secondary)"
                    style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend (bottom-left) */}
          <div style={{
            position: 'absolute', left: 16, bottom: 16,
            background: 'var(--ink-0)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '10px 12px', fontSize: 11,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
              color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Legend</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: '#c96442' }}/>Lead
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: '#7a5c3a' }}/>Supp.
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: '#bfb39a' }}/>Minor
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 2, background: 'rgba(74,67,56,.5)' }}/>Tie
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 2, background: 'var(--terracotta-500)',
                  borderTop: '0', backgroundImage: 'linear-gradient(to right, var(--terracotta-500) 60%, transparent 0)',
                  backgroundSize: '7px 2px',
                }}/>Conflict
              </span>
            </div>
          </div>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', right: 16, bottom: 16,
            background: 'var(--ink-0)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column',
            boxShadow: 'var(--shadow-card)',
          }}>
            <button style={{ ...iconBtn, width: 28, height: 28 }}>{I.plus}</button>
            <div style={{ height: 1, background: 'var(--border-subtle)' }}/>
            <button style={{ ...iconBtn, width: 28, height: 28, fontSize: 14 }}>−</button>
          </div>
        </div>
      </div>

      {/* Right detail */}
      {sel && (() => {
        const n = node(sel);
        const c = MOCK.characters.find(x => x.id === sel);
        const ties = MOCK.graphEdges.filter(e => e.a === sel || e.b === sel)
          .map(e => ({ ...e, other: e.a === sel ? e.b : e.a }));
        return (
          <div style={{
            width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--ink-25)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--ink-0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={n.label} color={colorForRole(n.role)} size={42} ring/>
                <div>
                  <div className="serif" style={{ fontSize: 18, fontWeight: 500, fontStyle: 'italic',
                    letterSpacing: '-0.018em' }}>{n.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{n.role}{c?.aka ? ` · ${c.aka}` : ''}</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
              <div style={{ ...sectionLabel }}>Direct ties · {ties.length}</div>
              {ties.map((t, i) => {
                const o = node(t.other);
                const oc = MOCK.characters.find(x => x.id === t.other);
                return (
                  <div key={i} onClick={() => setSel(t.other)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                  }}>
                    <Avatar name={o.label} color={colorForRole(o.role)} size={24}/>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{o.label}</span>
                    <Tag tone={t.conflict ? 'terracotta' : 'ink'} size="xs">{t.kind}</Tag>
                  </div>
                );
              })}
              <div style={{ ...sectionLabel, marginTop: 18 }}>Tie strength</div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--ink-50)', overflow: 'hidden' }}>
                <div style={{ width: `${(ties.reduce((s, t) => s + t.strength, 0) / ties.length) * 100}%`,
                  height: '100%', background: 'var(--terracotta-500)' }}/>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Avg. {Math.round((ties.reduce((s, t) => s + t.strength, 0) / ties.length) * 100)}% across {ties.length} ties
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

Object.assign(window, { GraphView });
