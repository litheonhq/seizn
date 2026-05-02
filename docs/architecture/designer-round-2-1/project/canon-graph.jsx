/* global React */
const { useState: useStateCG, useEffect: useEffectCG, useRef: useRefCG } = React;

/* ——————————————————————————————————————
   CANON GRAPH — Saebyeok 6 nodes + edges
   Tone: monochrome, edges with subtle conflict/canon signals
———————————————————————————————————————— */

const NODES = [
  { id: 'han_iseul', label: 'Han Iseul', role: 'protagonist', x: 0.22, y: 0.30, r: 30 },
  { id: 'jeong_serin', label: 'Jeong Serin', role: 'co-lead', x: 0.62, y: 0.18, r: 26 },
  { id: 'yun_hana', label: 'Yun Hana', role: 'supporting', x: 0.84, y: 0.42, r: 24 },
  { id: 'park_jio', label: 'Park Jio', role: 'supporting', x: 0.30, y: 0.74, r: 22 },
  { id: 'choe_doyun', label: 'Choe Doyun', role: 'antagonist', x: 0.70, y: 0.70, r: 26 },
  { id: 'kim_minchae', label: 'Kim Minchae', role: 'supporting', x: 0.52, y: 0.50, r: 20 },
];

const EDGES = [
  { from: 'han_iseul', to: 'jeong_serin', kind: 'canon', label: 'co-lead' },
  { from: 'han_iseul', to: 'kim_minchae', kind: 'canon', label: 'mentor' },
  { from: 'jeong_serin', to: 'yun_hana', kind: 'canon', label: 'rival' },
  { from: 'jeong_serin', to: 'kim_minchae', kind: 'pending', label: 'club' },
  { from: 'kim_minchae', to: 'choe_doyun', kind: 'conflict', label: 'witness · day 14' },
  { from: 'park_jio', to: 'han_iseul', kind: 'canon', label: 'classmate' },
  { from: 'park_jio', to: 'choe_doyun', kind: 'pending', label: 'observed' },
  { from: 'yun_hana', to: 'choe_doyun', kind: 'canon', label: 'photo evidence' },
];

function edgeColor(kind, tone = 'dark') {
  if (kind === 'conflict') return 'var(--signal-conflict)';
  if (kind === 'canon') return tone === 'dark' ? 'oklch(1 0 0 / 0.28)' : 'var(--ink-300)';
  if (kind === 'pending') return 'var(--signal-pending)';
  return 'var(--ink-300)';
}

function CanonGraph({ tone = 'dark', width = 560, height = 460, animate = true }) {
  const [hovered, setHovered] = useStateCG(null);
  const [tick, setTick] = useStateCG(0);

  useEffectCG(() => {
    if (!animate) return;
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, [animate]);

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const surfaceBg = tone === 'dark' ? 'var(--ink-900)' : 'var(--ink-0)';
  const nodeBg = tone === 'dark' ? 'oklch(0.20 0.014 250)' : 'var(--ink-0)';
  const nodeBorder = tone === 'dark' ? 'oklch(1 0 0 / 0.18)' : 'var(--ink-200)';
  const nodeText = tone === 'dark' ? 'oklch(1 0 0 / 0.92)' : 'var(--ink-900)';
  const subText = tone === 'dark' ? 'oklch(1 0 0 / 0.55)' : 'var(--ink-500)';

  // Pulsing edge — every other tick, the conflict edge pulses
  const pulseEdge = tick % 4 === 0 ? 'kim_minchae-choe_doyun' : null;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: width,
      aspectRatio: `${width} / ${height}`,
      background: surfaceBg,
      border: tone === 'dark' ? '1px solid oklch(1 0 0 / 0.08)' : '1px solid var(--ink-100)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: tone === 'dark' ? 'inset 0 1px 0 oklch(1 0 0 / 0.05)' : 'var(--shadow-sm)',
    }}>
      {/* Header strip */}
      <div style={{
        position: 'absolute', top: 14, left: 16, right: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 3,
      }}>
        <span className="badge" style={{
          background: tone === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'var(--ink-100)',
          color: tone === 'dark' ? 'oklch(1 0 0 / 0.8)' : 'var(--ink-700)',
          border: tone === 'dark' ? '1px solid oklch(1 0 0 / 0.08)' : 'none',
        }}>
          <span className="badge-dot" style={{ background: 'var(--signal-canon)' }} />
          canon graph · D30
        </span>
        <span className="mono" style={{ fontSize: 11, color: subText, letterSpacing: '0.04em' }}>
          6 nodes · 8 edges
        </span>
      </div>

      {/* SVG edges */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {EDGES.map((e, i) => {
          const a = nodeMap[e.from];
          const b = nodeMap[e.to];
          const x1 = a.x * width, y1 = a.y * height;
          const x2 = b.x * width, y2 = b.y * height;
          const isHovered = hovered === e.from || hovered === e.to;
          const key = `${e.from}-${e.to}`;
          const isPulse = pulseEdge === key;
          return (
            <g key={i}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={edgeColor(e.kind, tone)}
                strokeWidth={e.kind === 'conflict' ? 1.6 : 1.1}
                strokeDasharray={e.kind === 'pending' ? '4 4' : 'none'}
                opacity={isHovered ? 1 : (e.kind === 'conflict' ? 0.85 : 0.55)}
                style={{ transition: 'opacity 240ms ease' }}
              />
              {isPulse && (
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--signal-conflict)"
                  strokeWidth="3"
                  opacity="0.6"
                  style={{ filter: 'blur(2px)' }}
                >
                  <animate attributeName="opacity" values="0;0.7;0" dur="1.6s" />
                </line>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {NODES.map((n) => {
        const cx = n.x * width;
        const cy = n.y * height;
        const isHovered = hovered === n.id;
        return (
          <button
            key={n.id}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(n.id)}
            onBlur={() => setHovered(null)}
            style={{
              position: 'absolute',
              left: `${(cx - n.r) / width * 100}%`,
              top: `${(cy - n.r) / height * 100}%`,
              width: n.r * 2,
              height: n.r * 2,
              borderRadius: '50%',
              background: nodeBg,
              border: `1.4px solid ${isHovered ? 'var(--signal-canon)' : nodeBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
              transition: 'transform 200ms ease, border-color 200ms ease',
              transform: isHovered ? 'scale(1.06)' : 'scale(1)',
              boxShadow: isHovered ? '0 0 0 6px oklch(0.62 0.16 148 / 0.10)' : 'none',
              zIndex: 4,
            }}
          >
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: n.r > 24 ? 11 : 10,
              fontWeight: 500,
              color: nodeText,
              textAlign: 'center',
              lineHeight: 1.1,
              padding: 4,
            }}>
              {n.label}
            </span>
          </button>
        );
      })}

      {/* Hover label */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: `${nodeMap[hovered].x * 100}%`,
          top: `${nodeMap[hovered].y * 100 + 8}%`,
          transform: 'translate(-50%, 0)',
          background: tone === 'dark' ? 'oklch(0.14 0.012 250)' : 'var(--ink-900)',
          color: 'var(--ink-0)',
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          marginTop: 36,
          zIndex: 5,
        }}>
          {nodeMap[hovered].role}
        </div>
      )}

      {/* Footer strip */}
      <div style={{
        position: 'absolute', bottom: 14, left: 16, right: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 3,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <LegendDot color="var(--signal-canon)" tone={tone}>canon</LegendDot>
          <LegendDot color="var(--signal-pending)" tone={tone}>pending</LegendDot>
          <LegendDot color="var(--signal-conflict)" tone={tone}>conflict</LegendDot>
        </div>
        <span className="mono" style={{ fontSize: 10, color: subText }}>
          saebyeok · synthetic demo
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, tone, children }) {
  const txt = tone === 'dark' ? 'oklch(1 0 0 / 0.7)' : 'var(--ink-600)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      <span className="mono" style={{ fontSize: 10, color: txt, letterSpacing: '0.06em' }}>{children}</span>
    </span>
  );
}

window.CanonGraph = CanonGraph;
