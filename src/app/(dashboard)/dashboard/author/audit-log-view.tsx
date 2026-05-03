'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { AUDIT_COLUMNS } from './table-specs';

type JsonRecord = Record<string, unknown>;

interface AuditLogViewProps {
  logs: JsonRecord[];
  replayResult?: JsonRecord | null;
  onReplay: (decisionId: string) => void;
}

export function AuditLogView({ logs, replayResult, onReplay }: AuditLogViewProps) {
  const { t } = useDashboardTranslation();

  if (logs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
        No audit events recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-normal text-slate-500">
            <tr>
              {AUDIT_COLUMNS.map((column) => (
                <th key={column} className="px-3 py-2 font-medium">
                  {t(`author.table.audit.columns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((entry, index) => {
              const decisionId = String(entry.decision_id ?? '');
              return (
                <tr key={String(entry.id ?? index)} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    {t(`author.events.${String(entry.event_type ?? '')}`)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {formatDate(entry.created_at)}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-slate-600">
                    <span className="line-clamp-2 break-all">{decisionId}</span>
                  </td>
                  <td className="max-w-[240px] px-3 py-2 text-slate-600">
                    <span className="line-clamp-3 break-words">{formatCompact(entry.llm_meta)}</span>
                  </td>
                  <td className="max-w-[360px] px-3 py-2 text-slate-600">
                    <span className="line-clamp-3 break-words">{formatCompact(entry.payload)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!decisionId}
                      onClick={() => onReplay(decisionId)}
                      className="min-h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('author.table.audit.columns.replay')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {replayResult ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          <div className="font-medium">
            Replay {String(replayResult.replayStatus ?? replayResult.replay_status ?? '')}
          </div>
          <div className="mt-1 text-slate-600">
            Chain length: {Number(replayResult.chainLength ?? replayResult.chain_length ?? 0)}
          </div>
          <div className="mt-2 break-all text-xs text-slate-500">
            Payload hash: {String(replayResult.payloadHash ?? replayResult.payload_hash ?? '')}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatCompact(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const text = JSON.stringify(value);
  return text.length > 420 ? `${text.slice(0, 420)}...` : text;
}
