'use client';

import { useMemo, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import {
  compactCharacterLabel,
  initialForLabel,
  resolveRelationLabel,
} from '@/components/author/graph/relationship-graph-model';
import { Avatar, Tag } from '../atoms';
import type { CharacterRole } from '../types';
import type { CharacterSummary, GraphEdge, GraphNode } from './types';
import { GRAPH_VIEWBOX } from './graph-layout';

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const COLOR_FOR_ROLE: Record<string, string> = {
  Lead: '#c96442',
  Supporting: '#7a5c3a',
  Minor: '#bfb39a',
};

function colorForRole(role: string): string {
  return COLOR_FOR_ROLE[role] ?? '#7a5c3a';
}

function roleLabel(role: CharacterRole, t: (key: string) => string): string {
  if (role === 'Lead') return t('dashboard.graph.legend.lead');
  if (role === 'Supporting') return t('dashboard.graph.legend.supporting');
  return t('dashboard.graph.legend.minor');
}

function edgeKey(edge: GraphEdge, index: number): string {
  return `${edge.a}:${edge.b}:${index}`;
}

function labelBoxWidth(label: string): number {
  const charCount = Array.from(label).length;
  return Math.min(108, Math.max(36, charCount * 7 + 18));
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  characters: CharacterSummary[];
}

export function GraphView({ nodes, edges, characters }: GraphViewProps) {
  const { t } = useDashboardTranslation();
  const [selected, setSelected] = useState<string | null>(nodes[0]?.id ?? null);
  const [selectedTieKey, setSelectedTieKey] = useState<string | null>(null);

  const graphEdges = useMemo(
    () =>
      edges.map((edge, index) => {
        const relation = resolveRelationLabel(edge.kind, t);
        return {
          ...edge,
          key: edgeKey(edge, index),
          relationLabel: relation.label,
        };
      }),
    [edges, t],
  );

  const nodeMap = useMemo(() => new Map<string, GraphNode>(nodes.map((n) => [n.id, n])), [nodes]);
  const node = (id: string) => nodeMap.get(id);
  const selectedId = selected && nodeMap.has(selected) ? selected : nodes[0]?.id ?? null;

  const ties =
    selectedId != null
      ? graphEdges
          .filter((e) => e.a === selectedId || e.b === selectedId)
          .map((e) => ({ ...e, other: e.a === selectedId ? e.b : e.a }))
      : [];

  const selectedNode = selectedId ? node(selectedId) : undefined;
  const selectedCharacter = selectedId
    ? characters.find((c) => c.id === selectedId)
    : undefined;
  const selectedTie = selectedTieKey
    ? graphEdges.find((edge) => edge.key === selectedTieKey)
    : undefined;

  const summary = t('dashboard.graph.summary', {
    characters: nodes.length,
    ties: edges.length,
  });

  const directTiesLabel = t('dashboard.graph.detail.directTies', { count: ties.length });

  const avgStrength =
    ties.length > 0
      ? Math.round((ties.reduce((sum, edge) => sum + Math.abs(edge.strength), 0) / ties.length) * 100)
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
              letterSpacing: 0,
            }}
          >
            {t('dashboard.graph.title')}
          </span>
          <Tag tone="cream" size="xs">
            {summary}
          </Tag>
        </div>

        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--ink-25)',
            backgroundImage: 'radial-gradient(rgba(74, 67, 56, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0',
          }}
        >
          <svg
            viewBox={`0 0 ${GRAPH_VIEWBOX.width} ${GRAPH_VIEWBOX.height}`}
            style={{ width: '100%', height: '100%', display: 'block' }}
            role="img"
            aria-label={t('dashboard.graph.title')}
          >
            {graphEdges.map((edge) => {
              const a = node(edge.a);
              const b = node(edge.b);
              if (!a || !b) return null;
              const isSelectedTie = selectedTieKey === edge.key;
              const isConnectedToSelected = selectedId != null && (edge.a === selectedId || edge.b === selectedId);
              const isNegative = edge.conflict || edge.strength < -0.1;
              const stroke = isNegative
                ? 'var(--terracotta-500)'
                : edge.strength > 0.3
                  ? '#b86a47'
                  : 'rgba(74, 67, 56, 0.36)';
              const opacity = selectedId ? (isConnectedToSelected ? 0.9 : 0.16) : 0.62;
              const width = 1.2 + Math.min(2.4, Math.abs(edge.strength) * 2);
              return (
                <g key={edge.key} style={{ opacity, transition: 'opacity .18s ease' }}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={stroke}
                    strokeWidth={isSelectedTie ? width + 1.2 : width}
                    strokeDasharray={isNegative ? '6 4' : 'none'}
                    strokeLinecap="round"
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth="18"
                    strokeLinecap="round"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelected(edge.a);
                      setSelectedTieKey(edge.key);
                    }}
                  />
                </g>
              );
            })}

            {nodes.map((n) => {
              const isSel = selectedId === n.id;
              const isFaded =
                selectedId != null &&
                !isSel &&
                !graphEdges.some(
                  (e) =>
                    (e.a === selectedId && e.b === n.id) ||
                    (e.b === selectedId && e.a === n.id),
                );
              const fill = colorForRole(n.role);
              const label = compactCharacterLabel(n.label, 10);
              const labelWidth = labelBoxWidth(label);
              return (
                <g
                  key={n.id}
                  onClick={() => {
                    setSelected(n.id);
                    setSelectedTieKey(null);
                  }}
                  style={{
                    cursor: 'pointer',
                    opacity: isFaded ? 0.34 : 1,
                    transition: 'opacity .18s ease, transform .18s ease',
                  }}
                >
                  {isSel ? (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 7}
                      fill="none"
                      stroke={fill}
                      strokeWidth="1.5"
                      opacity="0.34"
                    />
                  ) : null}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={fill}
                    stroke="var(--bg-elevated)"
                    strokeWidth={isSel ? 3 : 2}
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    fontSize={n.r > 30 ? 15 : 12}
                    fontWeight="600"
                    fill="#ffffff"
                    fontStyle="italic"
                    style={{ fontFamily: 'var(--font-display-serif)', pointerEvents: 'none' }}
                  >
                    {initialForLabel(label)}
                  </text>
                  <rect
                    x={n.x - labelWidth / 2}
                    y={n.y + n.r + 7}
                    width={labelWidth}
                    height="18"
                    rx="9"
                    fill="var(--bg-elevated)"
                    stroke="var(--border-subtle)"
                    opacity="0.95"
                  />
                  <text
                    x={n.x}
                    y={n.y + n.r + 20}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight="500"
                    fill="var(--text-secondary)"
                    style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}
                  >
                    {label}
                  </text>
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
            <div style={SECTION_LABEL}>{t('dashboard.graph.legend.title')}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <LegendDot color="#c96442" label={t('dashboard.graph.legend.lead')} />
              <LegendDot color="#7a5c3a" label={t('dashboard.graph.legend.supporting')} />
              <LegendDot color="#bfb39a" label={t('dashboard.graph.legend.minor')} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{ width: 18, height: 2, background: '#b86a47' }}
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
        </div>
      </div>

      {selectedNode ? (
        <div
          style={{
            width: 320,
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
              <div style={{ minWidth: 0 }}>
                <div
                  className="serif"
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    fontStyle: 'italic',
                    letterSpacing: 0,
                  }}
                >
                  {selectedNode.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {roleLabel(selectedNode.role, t)}
                  {selectedCharacter?.aka ? ` - ${selectedCharacter.aka}` : ''}
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
            {selectedTie ? (
              <div
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  background: 'var(--bg-elevated)',
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div style={SECTION_LABEL}>{t('dashboard.graph.detail.selectedTie')}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedTie.relationLabel}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {node(selectedTie.a)?.label ?? selectedTie.a} - {node(selectedTie.b)?.label ?? selectedTie.b}
                </div>
              </div>
            ) : null}

            <div style={SECTION_LABEL}>{directTiesLabel}</div>
            {ties.length ? (
              ties.map((tie) => {
                const otherNode = node(tie.other);
                if (!otherNode) return null;
                return (
                  <button
                    key={tie.key}
                    type="button"
                    onClick={() => {
                      setSelected(tie.other);
                      setSelectedTieKey(tie.key);
                    }}
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
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>
                      {otherNode.label}
                    </span>
                    <Tag
                      tone={tie.conflict || tie.strength < -0.1 ? 'terracotta' : 'ink'}
                      size="xs"
                      style={{ maxWidth: 118, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {tie.relationLabel}
                    </Tag>
                  </button>
                );
              })
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {t('dashboard.graph.empty')}
              </div>
            )}
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
      ) : null}
    </div>
  );
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
