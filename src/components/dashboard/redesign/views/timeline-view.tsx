'use client';

import { useMemo, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { useAuthorAuditLogPages } from '@/hooks/useAuthorMemoryV3';
import type { AuthorAuditLogEntry } from '@/lib/author/audit';
import { TimelineIcon } from '../icons';
import { getTimelineEventMeta } from './timeline/event-meta';
import {
  groupAuditEntriesByDay,
  utcDayKey,
  type TimelineRow,
} from './timeline/group-audit-entries';

export interface TimelineViewProps {
  projectId?: string;
}

export function TimelineView({ projectId }: TimelineViewProps) {
  const { t } = useDashboardTranslation();
  const { data, size, setSize, error, isLoading, isValidating } = useAuthorAuditLogPages(
    projectId,
    { pageSize: 50 },
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const entries: AuthorAuditLogEntry[] = useMemo(() => {
    if (!data) return [];
    return data.flatMap((page) =>
      (page.audit_logs ?? []).map(rowToEntry),
    );
  }, [data]);

  const rows = useMemo(() => groupAuditEntriesByDay(entries), [entries]);
  const groupedByDay = useMemo(() => groupByDay(rows), [rows]);
  // Computed once on mount so DayHeader stays pure. useState's lazy
  // initializer is the sanctioned escape hatch for one-shot impure work.
  const [todayKey] = useState(() => utcDayKey(new Date().toISOString()));
  const [yesterdayKey] = useState(() =>
    utcDayKey(new Date(Date.now() - 86_400_000).toISOString()),
  );

  const lastPage = data?.[data.length - 1];
  const hasMore = Boolean(lastPage?.next_cursor);
  const showEmpty = !isLoading && entries.length === 0 && !error;

  return (
    <div
      className="timeline-view-root"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--bg-elevated)',
      }}
    >
      <header
        className="timeline-view-header"
        style={{
          padding: '24px 32px 16px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(122, 92, 58, 0.10)',
            color: 'var(--text-secondary)',
          }}
        >
          <TimelineIcon size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2
            className="serif"
            style={{
              fontSize: 22,
              fontStyle: 'italic',
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.015em',
            }}
          >
            {t('dashboard.timeline.title')}
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('dashboard.timeline.subtitle')}
          </span>
        </div>
      </header>

      <div
        className="timeline-view-body"
        aria-live="polite"
        aria-busy={isLoading || isValidating ? 'true' : undefined}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {error ? (
          <ErrorBanner message={t('dashboard.timeline.error')} />
        ) : null}
        {showEmpty ? <EmptyState t={t} /> : null}
        {groupedByDay.map(({ dayKey, dayRows }) => (
          <section key={dayKey} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DayHeader t={t} dayKey={dayKey} todayKey={todayKey} yesterdayKey={yesterdayKey} />
            <ul style={listReset}>
              {dayRows.map((row, index) => (
                <li
                  key={rowKey(row, index)}
                  style={{ marginTop: index === 0 ? 0 : 4 }}
                >
                  {row.kind === 'event' ? (
                    <EventRow entry={row.entry} t={t} />
                  ) : (
                    <GroupRow
                      row={row}
                      t={t}
                      expanded={expandedGroups.has(rowKey(row, index))}
                      onToggle={() => {
                        const key = rowKey(row, index);
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {hasMore ? (
          <button
            type="button"
            onClick={() => setSize(size + 1)}
            disabled={isValidating}
            style={loadMoreStyle(isValidating)}
          >
            {isValidating
              ? t('dashboard.timeline.loadingMore')
              : t('dashboard.timeline.loadMore')}
          </button>
        ) : null}
      </div>
      <style>{`
        @media (max-width: 720px) {
          .timeline-view-header {
            padding: 16px 16px 12px !important;
          }
          .timeline-view-body {
            padding: 16px 16px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}

type DashboardTranslate = (key: string, vars?: Record<string, string | number>) => string;

interface EventRowProps {
  entry: AuthorAuditLogEntry;
  t: DashboardTranslate;
}

function EventRow({ entry, t }: EventRowProps) {
  const meta = getTimelineEventMeta(entry.eventType);
  const Icon = meta.icon;
  return (
    <div style={eventRowStyle}>
      <div style={iconBubbleStyle}>
        <Icon size={14} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{t(meta.labelKey)}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {formatHourMinute(entry.createdAt, t)}
        </span>
      </div>
    </div>
  );
}

interface GroupRowProps {
  row: Extract<TimelineRow, { kind: 'group' }>;
  t: DashboardTranslate;
  expanded: boolean;
  onToggle: () => void;
}

function GroupRow({ row, t, expanded, onToggle }: GroupRowProps) {
  const meta = getTimelineEventMeta(row.eventType);
  const Icon = meta.icon;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" onClick={onToggle} style={groupRowButtonStyle} aria-expanded={expanded ? 'true' : 'false'}>
        <div style={iconBubbleStyle}>
          <Icon size={14} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>
            {t(meta.groupKey, { count: row.count })}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            {t('dashboard.timeline.range.window', {
              first: formatHourMinute(row.earliest.createdAt, t),
              last: formatHourMinute(row.latest.createdAt, t),
            })}
          </span>
        </div>
        <span style={countChipStyle}>{row.count}</span>
      </button>
      {expanded ? (
        <ul style={{ ...listReset, paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {row.entries.map((child) => (
            <li key={child.id} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {formatHourMinute(child.createdAt, t)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface DayHeaderProps {
  t: DashboardTranslate;
  dayKey: string;
  todayKey: string;
  yesterdayKey: string;
}

function DayHeader({ t, dayKey, todayKey, yesterdayKey }: DayHeaderProps) {
  const label =
    dayKey === todayKey
      ? t('dashboard.timeline.day.today')
      : dayKey === yesterdayKey
        ? t('dashboard.timeline.day.yesterday')
        : dayKey;
  return (
    <h3 style={dayHeaderStyle}>{label}</h3>
  );
}

function EmptyState({ t }: { t: DashboardTranslate }) {
  return (
    <div style={emptyStateStyle}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {t('dashboard.timeline.empty.title')}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        {t('dashboard.timeline.empty.body')}
      </span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(201, 100, 66, 0.08)',
        border: '1px solid rgba(201, 100, 66, 0.25)',
        color: 'var(--terracotta-500)',
        fontSize: 12.5,
      }}
    >
      {message}
    </div>
  );
}

function rowToEntry(record: Record<string, unknown>): AuthorAuditLogEntry {
  return {
    id: String(record.id ?? ''),
    projectId: String(record.project_id ?? ''),
    userId: String(record.user_id ?? ''),
    eventType: String(record.event_type ?? 'project.created') as AuthorAuditLogEntry['eventType'],
    payload: (record.payload ?? null) as AuthorAuditLogEntry['payload'],
    llmMeta: (record.llm_meta ?? undefined) as AuthorAuditLogEntry['llmMeta'],
    sourceSpan: (record.source_span ?? undefined) as AuthorAuditLogEntry['sourceSpan'],
    decisionId: String(record.decision_id ?? ''),
    parentDecisionId:
      typeof record.parent_decision_id === 'string' ? record.parent_decision_id : undefined,
    createdAt: String(record.created_at ?? ''),
  };
}

function groupByDay(rows: TimelineRow[]): Array<{ dayKey: string; dayRows: TimelineRow[] }> {
  const out: Array<{ dayKey: string; dayRows: TimelineRow[] }> = [];
  for (const row of rows) {
    const key = row.kind === 'event' ? row.dayKey : row.dayKey;
    if (out.length === 0 || out[out.length - 1]!.dayKey !== key) {
      out.push({ dayKey: key, dayRows: [row] });
    } else {
      out[out.length - 1]!.dayRows.push(row);
    }
  }
  return out;
}

function rowKey(row: TimelineRow, index: number): string {
  if (row.kind === 'event') return `e:${row.entry.id}`;
  return `g:${row.eventType}:${row.dayKey}:${row.latest.id}:${index}`;
}

function formatHourMinute(iso: string, t: DashboardTranslate): string {
  const hh = iso.slice(11, 13);
  const mm = iso.slice(14, 16);
  return t('dashboard.timeline.utcLabel', { hh, mm });
}

const listReset: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const dayHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  margin: 0,
};

const eventRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-subtle)',
};

const groupRowButtonStyle: React.CSSProperties = {
  appearance: 'none',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
};

const iconBubbleStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 13,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(122, 92, 58, 0.10)',
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const countChipStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(122, 92, 58, 0.12)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
};

const emptyStateStyle: React.CSSProperties = {
  padding: 24,
  borderRadius: 10,
  border: '1px dashed var(--border-subtle)',
  background: 'rgba(216, 168, 109, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

function loadMoreStyle(disabled: boolean): React.CSSProperties {
  return {
    alignSelf: 'center',
    marginTop: 4,
    padding: '8px 18px',
    borderRadius: 999,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    fontSize: 12.5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
