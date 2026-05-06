'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Tag } from '../atoms';
import { ConflictCard } from '../conflict-card';
import { EmptyState } from '../empty-state';
import type { ConflictItem } from './types';

export interface ConflictsViewProps {
  conflicts: ConflictItem[];
}

export function ConflictsView({ conflicts }: ConflictsViewProps) {
  const { t } = useDashboardTranslation();
  const critical = conflicts.filter((c) => c.severity === 'P1').length;
  const warning = conflicts.filter((c) => c.severity === 'P2').length;

  if (conflicts.length === 0) {
    return (
      <div style={{ flex: 1, background: 'var(--bg-elevated)', display: 'flex' }}>
        <EmptyState
          kind="characters"
          title={t('dashboard.conflicts.empty')}
          body={t('dashboard.conflicts.emptyBody')}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: 'var(--ink-25)',
      }}
    >
      <div
        style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--bg-elevated)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
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
          {t('dashboard.conflicts.title')}
        </span>
        <Tag tone="terracotta" size="xs">
          {t('dashboard.conflicts.criticalCount', { count: critical })}
        </Tag>
        <Tag tone="dawn" size="xs">
          {t('dashboard.conflicts.warningCount', { count: warning })}
        </Tag>
      </div>
      <div
        style={{
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {conflicts.map((c) => (
          <ConflictCard
            key={c.id}
            severity={c.severity}
            kind={c.kind}
            episode={c.episode}
            title={c.title}
            why={c.why}
            refs={c.refs}
            severityLabel={t(`dashboard.conflicts.severity.${severityKey(c.severity)}`)}
            resolveLabel={t('dashboard.conflicts.action.resolve')}
            openEvidenceLabel={t('dashboard.conflicts.action.openEvidence')}
            dismissLabel={t('dashboard.conflicts.action.dismiss')}
          />
        ))}
      </div>
    </div>
  );
}

function severityKey(severity: 'P1' | 'P2' | 'P3') {
  return severity === 'P1' ? 'p1' : severity === 'P2' ? 'p2' : 'p3';
}
