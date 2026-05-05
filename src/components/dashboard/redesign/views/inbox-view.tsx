'use client';

import { useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Avatar, Tag } from '../atoms';
import {
  BookmarkIcon,
  FilterIcon,
  MoreIcon,
  SortIcon,
  SparkIcon,
} from '../icons';
import { ICON_BTN_TOPBAR } from '../top-bar';
import type { Severity } from '../types';
import type { InboxKind, InboxRowDetail } from './types';

const PRIORITY_PALETTE: Record<Severity, { bg: string; ring: string }> = {
  P1: { bg: 'var(--terracotta-500)', ring: 'rgba(201, 100, 66, 0.20)' },
  P2: { bg: 'var(--dawn-500)', ring: 'rgba(217, 168, 71, 0.20)' },
  P3: { bg: 'var(--ink-200)', ring: 'rgba(74, 67, 56, 0.10)' },
};

function PriorityDot({ priority }: { priority: Severity }) {
  const palette = PRIORITY_PALETTE[priority];
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        background: palette.bg,
        boxShadow: `0 0 0 3px ${palette.ring}`,
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
}

function toneForKind(kind: InboxKind) {
  if (kind === 'Conflict') return 'terracotta' as const;
  if (kind === 'Canon') return 'dawn' as const;
  return 'ink' as const;
}

interface InboxRowItemProps {
  row: InboxRowDetail;
  selected: boolean;
  onClick: () => void;
}

function InboxRowItem({ row, selected, onClick }: InboxRowItemProps) {
  const [hover, setHover] = useState(false);
  const background = selected
    ? 'rgba(201, 100, 66, 0.06)'
    : hover
    ? 'var(--ink-25)'
    : 'transparent';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 18px',
        borderLeft: `2px solid ${selected ? 'var(--terracotta-500)' : 'transparent'}`,
        background,
        position: 'relative',
      }}
    >
      <div style={{ paddingTop: 5 }}>
        <PriorityDot priority={row.priority} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Tag tone={toneForKind(row.kind)} size="xs">
            {row.kind}
          </Tag>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            {row.episode}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.time}</span>
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: row.unread ? 600 : 500,
            color: 'var(--text-primary)',
            lineHeight: 1.45,
            letterSpacing: '-0.005em',
            textAlign: 'left',
          }}
        >
          {row.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>From</span>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{row.author}</span>
        </div>
      </div>
      {row.unread && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: 'var(--terracotta-500)',
            marginTop: 6,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function emphasizeBody(body: string, emphasisText?: string) {
  if (!emphasisText) return body;
  const idx = body.indexOf(emphasisText);
  if (idx < 0) return body;
  return (
    <>
      {body.slice(0, idx)}
      <mark
        style={{
          background: 'rgba(217, 168, 71, 0.30)',
          padding: '0 2px',
          borderRadius: 2,
        }}
      >
        {emphasisText}
      </mark>
      {body.slice(idx + emphasisText.length)}
    </>
  );
}

interface InboxDetailProps {
  row: InboxRowDetail | undefined;
}

function InboxDetail({ row }: InboxDetailProps) {
  const { t } = useDashboardTranslation();
  if (!row) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        —
      </div>
    );
  }
  const tone = toneForKind(row.kind);
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Tag tone={tone}>{row.kind}</Tag>
          <Tag tone="cream">
            <span className="mono" style={{ fontSize: 10.5 }}>
              {row.episode}
            </span>
          </Tag>
          <PriorityDot priority={row.priority} />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {t('dashboard.inbox.priority', { p: row.priority })}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" aria-label="Bookmark" style={ICON_BTN_TOPBAR}>
            <BookmarkIcon size={16} />
          </button>
          <button type="button" aria-label="More" style={ICON_BTN_TOPBAR}>
            <MoreIcon size={16} />
          </button>
        </div>
        <h2
          className="serif"
          style={{
            fontSize: 22,
            fontWeight: 500,
            lineHeight: 1.25,
            margin: 0,
            color: 'var(--text-primary)',
            letterSpacing: '-0.018em',
          }}
        >
          {row.title}
        </h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            color: 'var(--text-tertiary)',
          }}
        >
          <Avatar name={row.author} color="#7a5c3a" size={22} />
          <span style={{ fontWeight: 500 }}>{row.author}</span>
          <span>·</span>
          <span>{row.time}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {row.evidence.length > 0 && (
          <>
            <SectionLabel>{t('dashboard.inbox.detail.evidence')}</SectionLabel>
            {row.evidence.map((e, i) => (
              <div
                key={`${e.reference}-${i}`}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background:
                    e.kind === 'conflicting'
                      ? 'var(--terracotta-50)'
                      : 'var(--ink-25)',
                  border:
                    e.kind === 'conflicting'
                      ? '1px solid rgba(201, 100, 66, 0.20)'
                      : '1px solid var(--border-subtle)',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      color:
                        e.kind === 'conflicting'
                          ? 'var(--terracotta-700)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {e.reference}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color:
                        e.kind === 'conflicting'
                          ? 'var(--terracotta-700)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {e.kind === 'conflicting' ? 'conflicting fact' : 'recorded fact'}
                  </span>
                </div>
                <p
                  className="serif"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  {emphasizeBody(e.body, e.emphasisText)}
                </p>
              </div>
            ))}
          </>
        )}

        {row.suggestion && (
          <>
            <SectionLabel>{t('dashboard.inbox.detail.suggestion')}</SectionLabel>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ display: 'flex', color: 'var(--terracotta-500)' }}>
                  <SparkIcon size={14} />
                </span>
                <span style={{ fontWeight: 600 }}>
                  {t('dashboard.inbox.detail.memorySuggests')}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {row.suggestion.rationale}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '7px 14px',
                    background: 'var(--ink-900)',
                    color: 'var(--ink-25)',
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {t('dashboard.inbox.detail.applySuggestion')}
                </button>
                <button
                  type="button"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '7px 14px',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {t('dashboard.inbox.detail.openIn', { episode: row.episode })}
                </button>
                <button
                  type="button"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '7px 14px',
                    color: 'var(--text-tertiary)',
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  {t('dashboard.inbox.detail.notConflict')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

export interface InboxViewProps {
  rows: InboxRowDetail[];
}

export function InboxView({ rows }: InboxViewProps) {
  const { t } = useDashboardTranslation();
  const [selected, setSelected] = useState(rows[0]?.id ?? '');
  const row = rows.find((r) => r.id === selected) ?? rows[0];
  const unreadCount = rows.filter((r) => r.unread).length;
  const conflictsCount = rows.filter((r) => r.kind === 'Conflict').length;
  const reviewsCount = rows.filter((r) => r.kind === 'Review').length;
  const charactersCount = rows.filter((r) => r.kind === 'Character').length;

  const filters: { id: 'all' | 'conflicts' | 'reviews' | 'characters'; labelKey: string; n: number }[] = [
    { id: 'all', labelKey: 'dashboard.inbox.filter.all', n: rows.length },
    { id: 'conflicts', labelKey: 'dashboard.inbox.filter.conflicts', n: conflictsCount },
    { id: 'reviews', labelKey: 'dashboard.inbox.filter.reviews', n: reviewsCount },
    { id: 'characters', labelKey: 'dashboard.inbox.filter.characters', n: charactersCount },
  ];
  const [filter, setFilter] = useState<typeof filters[number]['id']>('all');

  const visibleRows = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'conflicts') return r.kind === 'Conflict';
    if (filter === 'reviews') return r.kind === 'Review';
    if (filter === 'characters') return r.kind === 'Character';
    return true;
  });

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          width: 380,
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            className="serif"
            style={{
              fontSize: 17,
              fontWeight: 500,
              fontStyle: 'italic',
              letterSpacing: '-0.015em',
            }}
          >
            {t('dashboard.inbox.title')}
          </span>
          <Tag tone="cream" size="xs">
            {t('dashboard.inbox.newCount', { count: unreadCount })}
          </Tag>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Filter"
            style={{ ...ICON_BTN_TOPBAR, width: 28, height: 28 }}
          >
            <FilterIcon size={14} />
          </button>
          <button
            type="button"
            aria-label="Sort"
            style={{ ...ICON_BTN_TOPBAR, width: 28, height: 28 }}
          >
            <SortIcon size={14} />
          </button>
        </div>
        <div
          style={{
            padding: '8px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 6,
            fontSize: 12,
          }}
        >
          {filters.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={isActive}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: isActive ? 'var(--ink-900)' : 'transparent',
                  color: isActive ? 'var(--ink-25)' : 'var(--text-tertiary)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {t(f.labelKey)}
                <span style={{ opacity: 0.7 }}>{f.n}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visibleRows.map((r) => (
            <InboxRowItem
              key={r.id}
              row={r}
              selected={r.id === (row?.id ?? '')}
              onClick={() => setSelected(r.id)}
            />
          ))}
          {visibleRows.length === 0 && (
            <div
              style={{
                padding: '40px 18px',
                textAlign: 'center',
                fontSize: 12.5,
                color: 'var(--text-muted)',
              }}
            >
              {t('dashboard.inbox.empty')}
            </div>
          )}
        </div>
      </div>
      <InboxDetail row={row} />
    </div>
  );
}
