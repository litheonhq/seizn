'use client';

import { useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Avatar, Tag } from '../atoms';
import { EmptyState } from '../empty-state';
import { FilterIcon, PlusIcon } from '../icons';
import { ICON_BTN_TOPBAR } from '../top-bar';
import type { CharacterSummary } from './types';
import type { GraphEdge, GraphNode } from './types';

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 8,
};

type GraphMode = 'force' | 'radial' | 'hierarchy';

const GRAPH_MODES: { id: GraphMode; labelKey: string }[] = [
  { id: 'force', labelKey: 'dashboard.graph.mode.force' },
  { id: 'radial', labelKey: 'dashboard.graph.mode.radial' },
  { id: 'hierarchy', labelKey: 'dashboard.graph.mode.hierarchy' },
];

const COLOR_FOR_ROLE: Record<string, string> = {
  Lead: '#c96442',
  Supporting: '#7a5c3a',
  Minor: '#bfb39a',
};

const GRAPH_W = 580;
const GRAPH_H = 380;
const GRAPH_CENTER_X = GRAPH_W / 2;
const GRAPH_CENTER_Y = GRAPH_H / 2;
const LABEL_WIDTH_FACTOR = 6.5;
const LABEL_HEIGHT = 12;
const LABEL_EDGE_GAP = 4;
const VERTICAL_LABEL_THRESHOLD = Math.cos(Math.PI / 3);

function colorForRole(role: string): string {
  return COLOR_FOR_ROLE[role] ?? '#7a5c3a';
}

type GraphLabelAnchor = 'start' | 'middle' | 'end';

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface LabelLayout {
  id: string;
  x: number;
  y: number;
  anchor: GraphLabelAnchor;
  box: LabelBox;
  priority: number;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  characters: CharacterSummary[];
}

export function GraphView({ nodes, edges, characters }: GraphViewProps) {
  const { t } = useDashboardTranslation();
  const [selected, setSelected] = useState<string | null>(nodes[0]?.id ?? null);
  const [mode, setMode] = useState<GraphMode>('force');

  if (nodes.length === 0) {
    return (
      <div style={{ flex: 1, background: 'var(--bg-elevated)', display: 'flex' }}>
        <EmptyState
          kind="graph"
          title={t('dashboard.graph.empty')}
          body={t('dashboard.graph.emptyBody')}
          primary={t('dashboard.graph.emptyCta')}
        />
      </div>
    );
  }

  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
  const node = (id: string) => nodeMap.get(id);
  const labelLayouts = visibleLabelLayouts(nodes);

  const ties =
    selected != null
      ? edges
          .filter((e) => e.a === selected || e.b === selected)
          .map((e) => ({ ...e, other: e.a === selected ? e.b : e.a }))
      : [];

  const selectedNode = selected ? node(selected) : undefined;
  const selectedCharacter = selected
    ? characters.find((c) => c.id === selected)
    : undefined;

  const summary = t('dashboard.graph.summary', {
    characters: nodes.length,
    ties: edges.length,
  });

  const directTiesLabel = t('dashboard.graph.detail.directTies', { count: ties.length });

  const avgStrength =
    ties.length > 0
      ? Math.round((ties.reduce((s, e) => s + e.strength, 0) / ties.length) * 100)
      : 0;

  const avgLabel = t('dashboard.graph.detail.avgStrength', {
    percent: avgStrength,
    count: ties.length,
  });

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            className="serif"
            style={{
              fontSize: 19,
              fontWeight: 500,
              fontStyle: 'italic',
              letterSpacing: '-0.018em',
            }}
          >
            {t('dashboard.graph.title')}
          </span>
          <Tag tone="cream" size="xs">
            {summary}
          </Tag>
          <span style={{ flex: 1 }} />
          <div
            style={{ display: 'flex', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}
            role="tablist"
            aria-label={t('dashboard.graph.title')}
          >
            {GRAPH_MODES.map((m) => {
              const isActive = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setMode(m.id)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    background: isActive ? 'var(--ink-25)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontWeight: isActive ? 600 : 500,
                    border: isActive
                      ? '1px solid var(--border-subtle)'
                      : '1px solid transparent',
                  }}
                >
                  {t(m.labelKey)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Filter"
            style={{ ...ICON_BTN_TOPBAR, width: 30, height: 30 }}
          >
            <FilterIcon size={14} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: `
              radial-gradient(900px 500px at 30% 30%, rgba(217, 168, 71, 0.04), transparent 60%),
              radial-gradient(700px 400px at 80% 80%, rgba(201, 100, 66, 0.04), transparent 60%),
              var(--ink-25)
            `,
            backgroundImage: 'radial-gradient(rgba(74, 67, 56, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0',
          }}
        >
          <svg
            viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
            style={{ width: '100%', height: '100%', display: 'block' }}
            role="img"
            aria-label={t('dashboard.graph.title')}
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(74, 67, 56, 0.45)" />
              </marker>
            </defs>

            {edges.map((e, i) => {
              const a = node(e.a);
              const b = node(e.b);
              if (!a || !b) return null;
              const isSel = selected != null && (e.a === selected || e.b === selected);
              const stroke = e.conflict ? 'var(--terracotta-500)' : 'rgba(74, 67, 56, 0.35)';
              const dash = e.conflict ? '4 3' : 'none';
              const opacity = selected ? (isSel ? 1 : 0.25) : 0.7;
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              const lw = 1 + e.strength * 1.5;
              return (
                <g key={`${e.a}-${e.b}-${i}`} style={{ opacity, transition: 'opacity .2s' }}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={stroke}
                    strokeWidth={lw}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                  />
                  {isSel && (
                    <g>
                      <rect
                        x={mid.x - 26}
                        y={mid.y - 9}
                        width={52}
                        height={18}
                        rx={9}
                        fill="var(--bg-elevated)"
                        stroke="var(--border-subtle)"
                      />
                      <text
                        x={mid.x}
                        y={mid.y + 3.5}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="600"
                        fill={
                          e.conflict
                            ? 'var(--terracotta-700)'
                            : 'var(--text-secondary)'
                        }
                        style={{ fontFamily: 'var(--font-sans)' }}
                      >
                        {e.kind}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {nodes.map((n) => {
              const isSel = selected === n.id;
              const isFaded =
                selected != null &&
                !isSel &&
                !edges.some(
                  (e) =>
                    (e.a === selected && e.b === n.id) ||
                    (e.b === selected && e.a === n.id)
                );
              const fill = colorForRole(n.role);
              const label = labelLayouts.get(n.id);
              return (
                <g
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: isFaded ? 0.35 : 1,
                    transition: 'opacity .2s, transform .2s',
                  }}
                >
                  {isSel && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 6}
                      fill="none"
                      stroke={fill}
                      strokeWidth="1.5"
                      opacity="0.4"
                    />
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={fill}
                    stroke="var(--bg-elevated)"
                    strokeWidth={isSel ? 3 : 2}
                  >
                    <title>{n.label}</title>
                  </circle>
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    fontSize={n.r > 30 ? 14 : 11}
                    fontWeight="600"
                    fill="#ffffff"
                    fontStyle="italic"
                    style={{ fontFamily: 'var(--font-display-serif)', pointerEvents: 'none' }}
                  >
                    {n.label.charAt(0)}
                  </text>
                  {label && (
                    <text
                      x={label.x}
                      y={label.y}
                      textAnchor={label.anchor}
                      fontSize="11"
                      fontWeight="500"
                      fill="var(--text-secondary)"
                      style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 11,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={SECTION_LABEL}>Legend</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <LegendDot color="#c96442" label={t('dashboard.graph.legend.lead')} />
              <LegendDot color="#7a5c3a" label={t('dashboard.graph.legend.supporting')} />
              <LegendDot color="#bfb39a" label={t('dashboard.graph.legend.minor')} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{ width: 18, height: 2, background: 'rgba(74, 67, 56, 0.5)' }}
                  aria-hidden="true"
                />
                {t('dashboard.graph.legend.tie')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 18,
                    height: 2,
                    backgroundImage:
                      'linear-gradient(to right, var(--terracotta-500) 60%, transparent 0)',
                    backgroundSize: '7px 2px',
                  }}
                  aria-hidden="true"
                />
                {t('dashboard.graph.legend.conflict')}
              </span>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <button
              type="button"
              aria-label="Zoom in"
              style={{ ...ICON_BTN_TOPBAR, width: 28, height: 28 }}
            >
              <PlusIcon size={14} />
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <button
              type="button"
              aria-label="Zoom out"
              style={{ ...ICON_BTN_TOPBAR, width: 28, height: 28, fontSize: 14 }}
            >
              −
            </button>
          </div>
        </div>
      </div>

      {selectedNode && (
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--ink-25)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '20px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar
                name={selectedNode.label}
                color={colorForRole(selectedNode.role)}
                size={42}
                ring
              />
              <div>
                <div
                  className="serif"
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    fontStyle: 'italic',
                    letterSpacing: '-0.018em',
                  }}
                >
                  {selectedNode.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {selectedNode.role}
                  {selectedCharacter?.aka ? ` · ${selectedCharacter.aka}` : ''}
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
            <div style={SECTION_LABEL}>{directTiesLabel}</div>
            {ties.map((tie, index) => {
              const otherNode = node(tie.other);
              if (!otherNode) return null;
              return (
                <button
                  key={`${tie.other}-${tie.kind}-${index}`}
                  type="button"
                  onClick={() => setSelected(tie.other)}
                  style={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <Avatar
                    name={otherNode.label}
                    color={colorForRole(otherNode.role)}
                    size={24}
                  />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                    {otherNode.label}
                  </span>
                  <Tag tone={tie.conflict ? 'terracotta' : 'ink'} size="xs">
                    {tie.kind}
                  </Tag>
                </button>
              );
            })}
            <div style={{ ...SECTION_LABEL, marginTop: 18 }}>
              {t('dashboard.graph.detail.tieStrength')}
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--ink-50)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${avgStrength}%`,
                  height: '100%',
                  background: 'var(--terracotta-500)',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {avgLabel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function visibleLabelLayouts(nodes: GraphNode[]): Map<string, LabelLayout> {
  const accepted: LabelLayout[] = [];
  const candidates = nodes
    .map((node) => createLabelLayout(node))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.id.localeCompare(b.id)
    );

  for (const candidate of candidates) {
    if (!accepted.some((label) => boxesOverlap(label.box, candidate.box))) {
      accepted.push(candidate);
    }
  }

  return new Map(accepted.map((layout) => [layout.id, layout]));
}

function createLabelLayout(node: GraphNode): LabelLayout {
  const angle = labelAngle(node);
  const anchor = textAnchorForAngle(angle);
  const width = Math.max(18, node.label.length * LABEL_WIDTH_FACTOR);
  const offset = node.r + 14;
  let x = node.x + Math.cos(angle) * offset;
  let y = node.y + Math.sin(angle) * offset;

  x = clampLabelX(x, width, anchor);
  y = clamp(y, LABEL_HEIGHT + LABEL_EDGE_GAP, GRAPH_H - LABEL_EDGE_GAP);

  return {
    id: node.id,
    x,
    y,
    anchor,
    box: labelBox(x, y, width, anchor),
    priority: rolePriority(node.role),
  };
}

function labelAngle(node: GraphNode): number {
  const dx = node.x - GRAPH_CENTER_X;
  const dy = node.y - GRAPH_CENTER_Y;
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
    return Math.PI / 2;
  }
  return Math.atan2(dy, dx);
}

function textAnchorForAngle(angle: number): GraphLabelAnchor {
  const xVector = Math.cos(angle);
  if (xVector > VERTICAL_LABEL_THRESHOLD) return 'start';
  if (xVector < -VERTICAL_LABEL_THRESHOLD) return 'end';
  return 'middle';
}

function clampLabelX(x: number, width: number, anchor: GraphLabelAnchor): number {
  if (anchor === 'start') {
    return clamp(x, LABEL_EDGE_GAP, GRAPH_W - width - LABEL_EDGE_GAP);
  }
  if (anchor === 'end') {
    return clamp(x, width + LABEL_EDGE_GAP, GRAPH_W - LABEL_EDGE_GAP);
  }
  return clamp(
    x,
    width / 2 + LABEL_EDGE_GAP,
    GRAPH_W - width / 2 - LABEL_EDGE_GAP
  );
}

function labelBox(x: number, y: number, width: number, anchor: GraphLabelAnchor): LabelBox {
  const left =
    anchor === 'middle'
      ? x - width / 2
      : anchor === 'end'
        ? x - width
        : x;
  return {
    left,
    right: left + width,
    top: y - 10,
    bottom: y + 2,
  };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function rolePriority(role: GraphNode['role']): number {
  if (role === 'Lead') return 3;
  if (role === 'Supporting') return 2;
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{ width: 10, height: 10, borderRadius: 5, background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
