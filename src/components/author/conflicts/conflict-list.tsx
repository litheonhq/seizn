'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/author/empty-state';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { useCharacterNameMap } from '@/hooks/useCharacterNameMap';
import { useResolveAuthorConflict } from '@/hooks/useAuthorMemoryV3';
import type { ConflictDecision, ConflictPayload } from '@/lib/author/ui/conflict-resolution';
import { ConflictCard, type AuthorUiConflict } from './conflict-card';

type StatusFilter = 'all' | 'open' | 'resolved';
type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

interface ConflictListProps {
  conflicts: AuthorUiConflict[];
  projectId: string;
}

export function ConflictList({ conflicts, projectId }: ConflictListProps) {
  const { t } = useDashboardTranslation();
  const characterNameMap = useCharacterNameMap(projectId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const resolvedCount = conflicts.filter(isResolved).length;
  const unresolvedCount = Math.max(0, conflicts.length - resolvedCount);
  const filteredConflicts = useMemo(() => (
    conflicts.filter((conflict) => {
      const statusMatches =
        statusFilter === 'all'
        || (statusFilter === 'resolved' && isResolved(conflict))
        || (statusFilter === 'open' && !isResolved(conflict));
      const severityMatches = severityFilter === 'all' || severityBucket(conflict.severity) === severityFilter;
      return statusMatches && severityMatches;
    })
  ), [conflicts, severityFilter, statusFilter]);

  if (conflicts.length === 0) {
    return (
      <EmptyState
        title={t('author.empty.conflicts.title')}
        body={t('author.empty.conflicts.body')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-950">충돌 {conflicts.length}건</div>
          <div className="mt-1 text-sm text-slate-600">
            미해결 {unresolvedCount}건  ·  해결됨 {resolvedCount}건
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            value={statusFilter}
            options={[
              ['all', '전체'],
              ['open', '미해결'],
              ['resolved', '해결됨'],
            ]}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
          />
          <SegmentedControl
            value={severityFilter}
            options={[
              ['all', '전체'],
              ['high', '심각'],
              ['medium', '중요'],
              ['low', '낮음'],
            ]}
            onChange={(value) => setSeverityFilter(value as SeverityFilter)}
          />
        </div>
      </div>

      {filteredConflicts.length ? (
        <div className="space-y-3">
          {filteredConflicts.map((conflict) => (
            <ConflictListItem
              key={conflict.id}
              conflict={conflict}
              projectId={projectId}
              characterNameMap={characterNameMap}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={t('author.empty.conflicts.title')}
          body={t('author.empty.conflicts.body')}
        />
      )}
    </div>
  );
}

function ConflictListItem({
  conflict,
  projectId,
  characterNameMap,
}: {
  conflict: AuthorUiConflict;
  projectId: string;
  characterNameMap: Map<string, string>;
}) {
  const resolveConflict = useResolveAuthorConflict(projectId, conflict.id);

  function handleResolve(decision: ConflictDecision, payload?: ConflictPayload) {
    void resolveConflict.trigger({
      decision,
      ...(payload ?? {}),
    });
  }

  return (
    <ConflictCard
      conflict={conflict}
      characterNameMap={characterNameMap}
      onResolve={handleResolve}
      isMutating={resolveConflict.isMutating}
    />
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={`min-h-8 rounded px-3 text-sm ${
            value === optionValue
              ? 'bg-slate-950 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function isResolved(conflict: AuthorUiConflict): boolean {
  return conflict.status === 'resolved' || conflict.status === 'deferred' || Boolean(conflict.resolution);
}

function severityBucket(value: unknown): SeverityFilter {
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}
