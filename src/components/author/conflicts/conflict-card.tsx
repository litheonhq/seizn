'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import type { ConflictDecision, ConflictPayload } from '@/lib/author/ui/conflict-resolution';

type JsonRecord = Record<string, unknown>;

export interface AuthorUiConflict {
  id: string;
  severity?: string;
  status?: string;
  detected_at?: string;
  existing_fact?: JsonRecord;
  new_fact?: JsonRecord;
  llm_analysis?: string;
  impact_summary?: string;
  affected_entities?: string[];
  resolution?: unknown;
}

interface ConflictCardProps {
  conflict: AuthorUiConflict;
  characterNameMap: Map<string, string>;
  onResolve: (decision: ConflictDecision, payload?: ConflictPayload) => void;
  isMutating?: boolean;
}

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-rose-50 text-rose-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  unresolved: 'bg-slate-100 text-slate-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  deferred: 'bg-amber-50 text-amber-700',
};

export function ConflictCard({ conflict, characterNameMap, onResolve, isMutating = false }: ConflictCardProps) {
  const { t } = useDashboardTranslation();
  const [showUndo, setShowUndo] = useState(false);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customEdits, setCustomEdits] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const existingFact = conflict.existing_fact ?? {};
  const newFact = conflict.new_fact ?? {};
  const resolution = normalizeResolution(conflict.resolution);
  const resolved = Boolean(resolution) || conflict.status === 'resolved' || conflict.status === 'deferred';
  const affectedEntityId = conflict.affected_entities?.[0];
  const characterName = affectedEntityId ? characterNameMap.get(affectedEntityId) ?? affectedEntityId : '';
  const dimension = readString(existingFact.dimension) ?? readString(newFact.dimension) ?? '사실 충돌';
  const title = characterName ? `〈${characterName}〉의 ${dimension} — 캐논과 새 사실 충돌` : `${dimension} — 캐논과 새 사실 충돌`;
  const severityKey = severityBucket(conflict.severity);
  const statusKey = statusKeyFor(conflict.status, resolution);
  const reasoning = useMemo(() => {
    const analysis = safePublicText(readString(conflict.llm_analysis));
    if (analysis) return analysis;
    const relationship = readString(newFact.suggested_relationship);
    if (relationship === 'scope_diff') return '같은 사실인데 적용 범위가 다릅니다.';
    return '정반대 진술입니다.';
  }, [conflict.llm_analysis, newFact]);

  useEffect(() => {
    if (!resolved) return;
    const showTimer = window.setTimeout(() => setShowUndo(true), 0);
    const hideTimer = window.setTimeout(() => setShowUndo(false), 30000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [resolved, conflict.id, resolution?.decision]);

  function submitCustomResolution() {
    let edits: JsonRecord | undefined;
    if (customEdits.trim()) {
      try {
        const parsed = JSON.parse(customEdits) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setCustomError('수정값은 객체 형식이어야 합니다.');
          return;
        }
        edits = parsed as JsonRecord;
      } catch {
        setCustomError('수정값 JSON 형식이 맞지 않습니다.');
        return;
      }
    }
    setCustomError(null);
    onResolve('custom', {
      ...(customText.trim() ? { text: customText.trim() } : {}),
      ...(edits ? { edits } : {}),
    });
    setIsCustomOpen(false);
  }

  if (resolved) {
    return (
      <article className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge className={STATUS_CLASS[statusKey]} label={t(`author.conflict.status.${statusKey}`)} />
          <span className="font-medium text-slate-900">{title}</span>
          <span className="text-slate-500">
            {resolution ? t(`author.conflict.actions.${resolution.decision}`) : t(`author.conflict.status.${statusKey}`)}
          </span>
          <span className="ml-auto text-xs text-slate-500">{formatDateTime(conflict.detected_at)}</span>
          {showUndo ? (
            <button
              type="button"
              className="min-h-8 rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50"
              onClick={() => setShowUndo(false)}
            >
              {t('author.conflict.undo')}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={SEVERITY_CLASS[severityKey]} label={t(`author.conflict.severity.${severityKey}`)} />
        <Badge className={STATUS_CLASS[statusKey]} label={t(`author.conflict.status.${statusKey}`)} />
        <span className="ml-auto text-xs text-slate-500">{formatDateTime(conflict.detected_at)}</span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-950">{title}</h3>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FactPanel title="기존 캐논" fact={existingFact} fallbackCitation={readString(existingFact.entity_id)} />
        <FactPanel title="새 사실" fact={newFact} fallbackCitation={readString(newFact.id)} />
      </div>

      <section className="mt-4 rounded-md bg-slate-50 p-3">
        <h4 className="text-sm font-medium text-slate-900">{t('author.conflict.reasoning_title')}</h4>
        <p className="mt-2 text-sm leading-6 text-slate-700">{reasoning}</p>
      </section>

      <section className="mt-4">
        <h4 className="text-sm font-medium text-slate-900">{t('author.conflict.impact_title')}</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {impactLines(conflict, characterNameMap, t('author.conflict.impact_fallback')).map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <ResolveButton disabled={isMutating} onClick={() => onResolve('keep_existing')}>
          {t('author.conflict.actions.keep_existing')}
        </ResolveButton>
        <ResolveButton disabled={isMutating} onClick={() => onResolve('replace_with_new')}>
          {t('author.conflict.actions.replace_with_new')}
        </ResolveButton>
        <ResolveButton disabled={isMutating} onClick={() => onResolve('defer_both')}>
          {t('author.conflict.actions.defer_both')}
        </ResolveButton>
        <ResolveButton disabled={isMutating} onClick={() => setIsCustomOpen(true)}>
          {t('author.conflict.actions.custom')}
        </ResolveButton>
      </div>

      {isCustomOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl">
            <div className="text-base font-semibold text-slate-950">{t('author.conflict.actions.custom')}</div>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor={`custom-text-${conflict.id}`}>
              해결 메모
            </label>
            <textarea
              id={`custom-text-${conflict.id}`}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-slate-500"
            />
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor={`custom-edits-${conflict.id}`}>
              수정값 JSON
            </label>
            <textarea
              id={`custom-edits-${conflict.id}`}
              value={customEdits}
              onChange={(event) => setCustomEdits(event.target.value)}
              className="mt-2 min-h-20 w-full rounded-md border border-slate-300 p-3 font-mono text-xs outline-none focus:border-slate-500"
              placeholder="{}"
            />
            {customError ? <p className="mt-2 text-sm text-[var(--signal-conflict-ink)]">{customError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCustomOpen(false)}
                className="min-h-10 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={submitCustomResolution}
                disabled={isMutating}
                className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function FactPanel({ title, fact, fallbackCitation }: { title: string; fact: JsonRecord; fallbackCitation?: string }) {
  const quote = safePublicText(readString(fact.content)) ?? '';
  const source = sourceFileLabel(fact.source);
  const citation = fallbackCitation ?? citationLabel(fact);

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <p className="mt-3 text-sm italic leading-6 text-slate-800">{`'${quote}'`}</p>
      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="font-mono">{citation}</div>
        <div>자료: {source}</div>
        <div>신뢰도 {confidencePercent(fact.confidence)}</div>
      </div>
    </div>
  );
}

function Badge({ className, label }: { className: string; label: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function ResolveButton({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function normalizeResolution(value: unknown): { decision: ConflictDecision } | null {
  if (typeof value === 'string') {
    return isConflictDecisionValue(value) ? { decision: value } : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const decision = (value as JsonRecord).decision;
    return isConflictDecisionValue(decision) ? { decision } : null;
  }
  return null;
}

function isConflictDecisionValue(value: unknown): value is ConflictDecision {
  return value === 'keep_existing' || value === 'replace_with_new' || value === 'defer_both' || value === 'custom';
}

function severityBucket(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}

function statusKeyFor(status: unknown, resolution: { decision: ConflictDecision } | null): 'unresolved' | 'resolved' | 'deferred' {
  if (status === 'deferred') return 'deferred';
  if (status === 'resolved' || resolution) return 'resolved';
  return 'unresolved';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safePublicText(value?: string): string | undefined {
  if (!value) return undefined;
  const text = value.replaceAll('"', "'");
  const legacySeedMarker = String.fromCharCode(107, 110, 111, 116);
  return text.toLowerCase().includes(legacySeedMarker) ? undefined : text;
}

function sourceFileLabel(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '자료 없음';
  const source = value as JsonRecord;
  return safePublicText(readString(source.file_path) ?? readString(source.document_id)) ?? '기존 캐논 자료';
}

function citationLabel(fact: JsonRecord): string {
  return safePublicText(readString(fact.id) ?? readString(fact.entity_id) ?? readString(fact.candidate_id)) ?? 'citation';
}

function confidencePercent(value: unknown): string {
  const number = typeof value === 'number' ? value : Number(value ?? 0);
  const normalized = Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  return `${Math.round(normalized * 100)}%`;
}

function formatDateTime(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

function impactLines(conflict: AuthorUiConflict, characterNameMap: Map<string, string>, fallback: string): string[] {
  const entities = conflict.affected_entities ?? [];
  const lines = entities
    .map((id) => characterNameMap.get(id) ?? safePublicText(id))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .map((name) => `${name}의 캐논 판단에 영향을 줍니다.`);
  if (lines.length > 0) return lines;
  const summary = safePublicText(readString(conflict.impact_summary));
  return summary ? [summary] : [fallback];
}
