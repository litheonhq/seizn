'use client';

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock3,
  FileText,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  ScrollText,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import {
  useAuthorAuditLogs,
  useAuthorCandidates,
  useAuthorCharacters,
  useAuthorConflicts,
  useAuthorGraph,
  useAuthorImports,
  useAuthorProjects,
  useAuthorTimeline,
  useDeleteAuthorImport,
  useGenerateAuthorBacklog,
  useReplayAuthorAuditDecision,
  useRunAuthorSimulation,
  useAuthorSimulation,
  useUploadAuthorImport,
} from '@/hooks/useAuthorMemoryV3';
import { EmptyState } from '@/components/author/empty-state';
import { ConflictList } from '@/components/author/conflicts/conflict-list';
import type { AuthorUiConflict } from '@/components/author/conflicts/conflict-card';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { AuditLogView } from './audit-log-view';
import {
  CANDIDATE_COLUMNS,
  CHARACTER_COLUMNS,
  IMPORT_COLUMNS,
  TIMELINE_COLUMNS,
} from './table-specs';

type JsonRecord = Record<string, unknown>;
type TableKey = 'imports' | 'candidates' | 'characters' | 'graph' | 'timeline' | 'audit';
type CellRenderer = (value: unknown, row: JsonRecord) => ReactNode;

const screenMeta = [
  { id: 'inbox', icon: FileText },
  { id: 'review', icon: RefreshCw },
  { id: 'characters', icon: UserRound },
  { id: 'graph', icon: GitBranch },
  { id: 'timeline', icon: Clock3 },
  { id: 'conflicts', icon: AlertTriangle },
  { id: 'simulate', icon: Play },
  { id: 'audit', icon: ScrollText },
] as const;

type ScreenId = (typeof screenMeta)[number]['id'];

export function AuthorMemoryV3Client() {
  const { t } = useDashboardTranslation();
  const [screen, setScreen] = useState<ScreenId>('review');
  const [simulationId, setSimulationId] = useState<string | undefined>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>();
  const [backlogResult, setBacklogResult] = useState<JsonRecord | null>(null);
  const [backlogElapsedSec, setBacklogElapsedSec] = useState(0);
  const [replayDecisionId, setReplayDecisionId] = useState<string | undefined>();
  const projects = useAuthorProjects();
  const projectId = String(projects.data?.projects?.[0]?.id ?? 'knot');
  const imports = useAuthorImports(projectId);
  const candidates = useAuthorCandidates(projectId, { status: 'candidate', page_size: 12 });
  const characters = useAuthorCharacters(projectId);
  const graph = useAuthorGraph(projectId);
  const timeline = useAuthorTimeline(projectId);
  const conflicts = useAuthorConflicts(projectId, { status: 'open' });
  const audit = useAuthorAuditLogs(projectId, { limit: 25 });
  const auditReplay = useReplayAuthorAuditDecision(projectId, replayDecisionId);
  const runSimulation = useRunAuthorSimulation(projectId);
  const simulation = useAuthorSimulation(projectId, simulationId);
  const uploadImport = useUploadAuthorImport(projectId);
  const activeCharacterId = selectedCharacterId ?? String(characters.data?.characters?.[0]?.id ?? '');
  const generateBacklog = useGenerateAuthorBacklog(projectId, activeCharacterId || undefined);
  const currentProject = projects.data?.projects?.[0];
  const [uploadRole, setUploadRole] = useState('canon');
  const [uploadMode, setUploadMode] = useState('extract');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const screens = useMemo(() => screenMeta.map((item) => ({
    ...item,
    label: t(`author.tabs.${item.id}`),
  })), [t]);
  const activeScreen = screens.find((item) => item.id === screen) ?? screens[0];

  const counts = useMemo(() => ({
    imports: imports.data?.summary?.total ?? 0,
    candidates: candidates.data?.total ?? currentProject?.candidate_count ?? 0,
    characters: characters.data?.characters?.length ?? currentProject?.entity_count ?? 0,
    conflicts: conflicts.data?.conflicts?.length ?? Number(currentProject?.conflict_count ?? 0),
    graphEdges: graph.data?.edges?.length ?? 0,
    events: timeline.data?.events?.length ?? 0,
  }), [imports.data, candidates.data, characters.data, conflicts.data, graph.data, timeline.data, currentProject]);

  const isLoading =
    projects.isLoading ||
    imports.isLoading ||
    candidates.isLoading ||
    characters.isLoading;
  const importCellRenderers = useMemo<Record<string, CellRenderer>>(() => ({
    parse_status: (value) => t(`author.table.imports.parse_status.${String(value)}`),
    extract_status: (value) => t(`author.table.imports.extract_status.${String(value)}`),
    source_role: (value) => t(`author.table.imports.source_role.${String(value)}`),
  }), [t]);
  const candidateCellRenderers = useMemo<Record<string, CellRenderer>>(() => ({
    type: (value) => t(`author.table.candidates.type.${String(value)}`),
    status: (value) => (
      <StatusBadge status={String(value)} label={t(`author.table.candidates.status.${String(value)}`)} />
    ),
    confidence: (value) => <ConfidenceBar value={Number(value ?? 0)} />,
  }), [t]);
  const characterCellRenderers = useMemo<Record<string, CellRenderer>>(() => ({
    aliases: (value) => Array.isArray(value) ? value.map(String).join(', ') : '',
  }), []);

  async function handleRunSimulation() {
    const firstCharacter = characters.data?.characters?.[0];
    const result = await runSimulation.trigger({
      scene_input: {
        text: 'The club room has gone quiet after a new canon clue surfaced.',
        setting: { location: 'club room', time: 'D29', mood: 'tense' },
        characters_present: (characters.data?.characters ?? []).slice(0, 4).map((item) => item.id),
        timepoint: { day: 29, scene_position: 'middle' },
        pressure: 'A contradiction may expose an author-only fact.',
        perspective: String(firstCharacter?.id ?? 'knot.short1.char.sori'),
        candidate_count: 3,
      },
    });
    setSimulationId(result.simulation_id);
    setScreen('simulate');
  }

  function openUploadDialog() {
    uploadInputRef.current?.click();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError(null);
    const form = new FormData();
    form.set('file', file);
    form.set('source_role', uploadRole);
    form.set('a_or_d_mode', uploadMode);

    try {
      await uploadImport.trigger(form);
      setScreen('inbox');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  }

  async function handleGenerateBacklog() {
    if (!activeCharacterId) return;
    setBacklogElapsedSec(0);
    const result = await generateBacklog.trigger({
      categories: ['좋아하는 것', '싫어하는 것', '작은 보상', '작은 짜증'],
      items_per_category: 5,
    });
    setBacklogResult(result);
    setScreen('characters');
  }

  useEffect(() => {
    if (!generateBacklog.isMutating) {
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setBacklogElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [generateBacklog.isMutating]);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Author Memory v3</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {String(currentProject?.name ?? 'KNOT Author Memory')} · {String(currentProject?.phase ?? 'Phase 1')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/author/settings"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                {t('dashboard.nav.author.settings')}
              </Link>
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={runSimulation.isMutating}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('author.actions.run_scene')}
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric
              label={t('author.cards.imports')}
              value={counts.imports}
              descriptor={t('author.cards.imports.descriptor')}
            />
            <Metric
              label={t('author.cards.candidates')}
              value={counts.candidates}
              descriptor={t('author.cards.candidates.descriptor')}
            />
            <Metric
              label={t('author.cards.characters')}
              value={counts.characters}
              descriptor={t('author.cards.characters.descriptor')}
            />
            <Metric
              label={t('author.cards.conflicts')}
              value={counts.conflicts}
              descriptor={t('author.cards.conflicts.descriptor')}
              danger={counts.conflicts > 0}
            />
            <Metric
              label={t('author.cards.edges')}
              value={counts.graphEdges}
              descriptor={t('author.cards.edges.descriptor')}
            />
            <Metric
              label={t('author.cards.events')}
              value={counts.events}
              descriptor={t('author.cards.events.descriptor')}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
          {screens.map((item) => {
            const Icon = item.icon;
            const active = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`inline-flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <section className="min-w-0">
          {isLoading ? (
            <Panel title="Loading">
              <div className="h-48 animate-pulse rounded-md bg-slate-100" />
            </Panel>
          ) : null}
          {!isLoading && screen === 'inbox' ? (
            <Panel title={t('author.panels.inbox')} description={t('author.tabs.inbox.subline')}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label
                  aria-disabled={uploadImport.isMutating}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  {t('author.actions.upload')}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="sr-only"
                    accept=".md,.markdown,.docx,.pdf,.txt,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    aria-disabled={uploadImport.isMutating}
                    disabled={uploadImport.isMutating}
                    onChange={handleImportFile}
                  />
                </label>
                <select
                  value={uploadRole}
                  onChange={(event) => setUploadRole(event.target.value)}
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  <option value="canon">Canon</option>
                  <option value="character">Character</option>
                  <option value="scene">Scene</option>
                  <option value="reference">Reference</option>
                  <option value="visual">Visual</option>
                </select>
                <select
                  value={uploadMode}
                  onChange={(event) => setUploadMode(event.target.value)}
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  <option value="extract">Extract</option>
                  <option value="raw_keep">Raw keep</option>
                </select>
                {uploadImport.isMutating ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-sm text-slate-600"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t('author.toasts.uploading')}
                  </span>
                ) : null}
                {uploadError ? (
                  <span className="text-sm text-[var(--signal-conflict-ink)]">{uploadError}</span>
                ) : null}
              </div>
              <ImportsTable
                projectId={projectId}
                imports={(imports.data?.imports as JsonRecord[] | undefined) ?? []}
                t={t}
                onUpload={openUploadDialog}
                cellRenderers={importCellRenderers}
              />
            </Panel>
          ) : null}
          {!isLoading && screen === 'review' ? (
            <Panel title={t('author.panels.review')} description={t('author.tabs.review.subline')}>
              {candidates.data?.candidates?.length ? (
                <Rows
                  rows={candidates.data.candidates}
                  columns={CANDIDATE_COLUMNS}
                  table="candidates"
                  cellRenderers={candidateCellRenderers}
                />
              ) : (
                <EmptyState
                  title={t('author.empty.review.title')}
                  body={t('author.empty.review.body')}
                  icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />}
                  cta={{ label: t('author.empty.review.cta'), onClick: handleGenerateBacklog }}
                />
              )}
            </Panel>
          ) : null}
          {!isLoading && screen === 'characters' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.characters.subline')}>
              {characters.data?.characters?.length ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <select
                      value={activeCharacterId}
                      onChange={(event) => {
                        setSelectedCharacterId(event.target.value);
                        setBacklogResult(null);
                      }}
                      className="min-h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                    >
                      {characters.data.characters.map((character) => (
                        <option key={String(character.id)} value={String(character.id)}>
                          {String(character.name)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleGenerateBacklog}
                      disabled={!activeCharacterId || generateBacklog.isMutating}
                      aria-busy={generateBacklog.isMutating}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {generateBacklog.isMutating ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                      {generateBacklog.isMutating ? t('author.toasts.ai_generating') : t('author.actions.generate_backlog')}
                    </button>
                    {generateBacklog.isMutating ? (
                      <span
                        className="inline-flex items-center gap-1 text-sm text-slate-500"
                        role="status"
                        aria-live="polite"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        {backlogElapsedSec}초 경과
                      </span>
                    ) : null}
                    {!generateBacklog.isMutating && generateBacklog.error ? (
                      <span className="text-sm text-[var(--signal-conflict-ink)]">{generateBacklog.error.message}</span>
                    ) : null}
                  </div>
                  {backlogResult ? (
                    <div className="mb-4 rounded-md border border-[var(--signal-canon)] bg-[var(--signal-canon-soft)] p-3 text-sm text-[var(--signal-canon-ink)]">
                      <div className="font-medium">
                        {String(backlogResult.character_name)} 백로그 생성 완료 · 후보 {Number((backlogResult.candidates as unknown[] | undefined)?.length ?? 0)}개
                      </div>
                      <div className="mt-1 text-[var(--signal-canon-ink)]">{t('author.toasts.review_queue_updated')}</div>
                      <div className="mt-3">
                        <RawRows
                          rows={((backlogResult.candidates as JsonRecord[] | undefined) ?? []).slice(0, 8)}
                          columns={['category', 'content', 'rationale']}
                        />
                      </div>
                    </div>
                  ) : null}
                  <Rows
                    rows={characters.data.characters}
                    columns={CHARACTER_COLUMNS}
                    table="characters"
                    cellRenderers={characterCellRenderers}
                  />
                </>
              ) : (
                <EmptyState
                  title={t('author.empty.characters.title')}
                  body={t('author.empty.characters.body')}
                  icon={<UserRound className="h-6 w-6" aria-hidden="true" />}
                  cta={{ label: t('author.empty.characters.cta'), onClick: openUploadDialog }}
                />
              )}
            </Panel>
          ) : null}
          {!isLoading && screen === 'graph' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.graph.subline')}>
              <RawRows rows={graph.data?.edges?.slice(0, 12) ?? []} columns={['from', 'type', 'to', 'intensity']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'timeline' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.timeline.subline')}>
              {timeline.data?.events?.length ? (
                <Rows rows={timeline.data.events.slice(0, 16)} columns={TIMELINE_COLUMNS} table="timeline" />
              ) : (
                <EmptyState
                  title={t('author.empty.timeline.title')}
                  body={t('author.empty.timeline.body')}
                  icon={<Clock3 className="h-6 w-6" aria-hidden="true" />}
                />
              )}
            </Panel>
          ) : null}
          {!isLoading && screen === 'conflicts' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.conflicts.subline')}>
              <ConflictList
                conflicts={(conflicts.data?.conflicts as AuthorUiConflict[] | undefined) ?? []}
                projectId={projectId}
              />
            </Panel>
          ) : null}
          {!isLoading && screen === 'simulate' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.simulate.subline')}>
              {simulationId ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="font-medium">미리보기 {simulationId}</div>
                    <div className="mt-1 text-slate-600">
                      상태: {String(simulation.data?.status ?? 'loading')} · 후보 {Number((simulation.data?.candidates as unknown[] | undefined)?.length ?? 0)}개
                    </div>
                  </div>
                  <RawRows
                    rows={(simulation.data?.candidates as JsonRecord[] | undefined) ?? []}
                    columns={['candidate_id', 'rank']}
                  />
                </div>
              ) : (
                <EmptyState
                  title={t('author.empty.simulate.title')}
                  body={t('author.empty.simulate.body')}
                  icon={<Play className="h-6 w-6" aria-hidden="true" />}
                  cta={{ label: t('author.empty.simulate.cta'), onClick: handleRunSimulation }}
                />
              )}
            </Panel>
          ) : null}
          {!isLoading && screen === 'audit' ? (
            <Panel title={activeScreen.label} description={t('author.tabs.audit.subline')}>
              {audit.data?.audit_logs?.length ? (
                <AuditLogView
                  logs={audit.data.audit_logs}
                  replayResult={auditReplay.data ?? null}
                  onReplay={setReplayDecisionId}
                />
              ) : (
                <EmptyState
                  title={t('author.empty.audit.title')}
                  body={t('author.empty.audit.body')}
                  icon={<ScrollText className="h-6 w-6" aria-hidden="true" />}
                />
              )}
              {audit.error ? (
                <div className="mt-4 rounded-md border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] p-3 text-sm text-[var(--signal-conflict-ink)]">
                  Audit log could not be loaded.
                </div>
              ) : null}
            </Panel>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  descriptor,
  danger = false,
}: {
  label: string;
  value: unknown;
  descriptor?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium tracking-normal text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${danger ? 'text-[var(--signal-conflict-ink)]' : 'text-slate-950'}`}>
        {String(value)}
      </div>
      {descriptor ? (
        <div className="mt-1 text-xs text-slate-500">{descriptor}</div>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Rows({
  rows,
  columns,
  table,
  cellRenderers,
}: {
  rows: JsonRecord[];
  columns: readonly string[];
  table: TableKey;
  cellRenderers?: Record<string, CellRenderer>;
}) {
  const { t } = useDashboardTranslation();
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-normal text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {t(`author.table.${table}.columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.candidate_id ?? index)} className="align-top">
              {columns.map((column) => (
                <td key={column} className="max-w-[360px] px-3 py-2 text-slate-700">
                  <span className="line-clamp-3 break-words">
                    {cellRenderers?.[column]?.(row[column], row) ?? formatCell(row[column])}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawRows({ rows, columns }: { rows: JsonRecord[]; columns: readonly string[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-normal text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.candidate_id ?? index)} className="align-top">
              {columns.map((column) => (
                <td key={column} className="max-w-[360px] px-3 py-2 text-slate-700">
                  <span className="line-clamp-3 break-words">{formatCell(row[column])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportsTable({
  projectId,
  imports,
  t,
  onUpload,
  cellRenderers,
}: {
  projectId: string;
  imports: JsonRecord[];
  t: (key: string) => string;
  onUpload: () => void;
  cellRenderers: Record<string, CellRenderer>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const deleteImport = useDeleteAuthorImport(projectId, pendingId ?? undefined);

  async function handleDelete(importId: string, fileName: string) {
    if (!importId) return;
    if (!window.confirm(`'${fileName}'을 삭제하시겠습니까? 이 파일에서 추출된 후보·이력도 함께 사라집니다.`)) {
      return;
    }
    setPendingId(importId);
    try {
      await deleteImport.trigger(null);
    } finally {
      setPendingId(null);
    }
  }

  const isParsingOnly = imports.length > 0 && imports.every((item) => item.parse_status === 'parsing');

  if (imports.length === 0) {
    return (
      <EmptyState
        title={t('author.empty.inbox.title')}
        body={t('author.empty.inbox.body')}
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        cta={{ label: t('author.empty.inbox.cta'), onClick: onUpload }}
      />
    );
  }

  if (isParsingOnly) {
    return (
      <EmptyState
        title={t('author.empty.inbox.parsing.title')}
        body={t('author.empty.inbox.parsing.body')}
        icon={<Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-normal text-slate-500">
          <tr>
            {IMPORT_COLUMNS.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {t(`author.table.imports.columns.${column}`)}
              </th>
            ))}
            <th className="px-3 py-2 font-medium" aria-label="actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {imports.map((row, index) => {
            const importId = String(row.id ?? row.import_id ?? '');
            const fileName = String(row.file_name ?? '');
            const isDeleting = pendingId === importId && deleteImport.isMutating;
            return (
              <tr key={importId || index} className="align-top">
                {IMPORT_COLUMNS.map((column) => (
                  <td key={column} className="max-w-[360px] px-3 py-2 text-slate-700">
                    <span className="line-clamp-3 break-words">
                      {cellRenderers[column]?.(row[column], row) ?? formatCell(row[column])}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(importId, fileName)}
                    disabled={!importId || isDeleting}
                    aria-label={`${fileName} 삭제`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-[var(--signal-conflict-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  candidate: 'bg-slate-100 text-slate-600',
  canon: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-600',
  retired: 'bg-slate-100 text-slate-500',
  past_only: 'bg-amber-50 text-amber-700',
  contradicted: 'bg-rose-50 text-rose-700',
  invalidated: 'bg-slate-100 text-slate-500',
  author_only: 'bg-indigo-50 text-indigo-600',
  character_known: 'bg-sky-50 text-sky-700',
  character_unknown: 'bg-slate-100 text-slate-600',
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-medium ${STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.candidate}`}>
      {label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const percent = Math.round(normalized * 100);

  return (
    <span className="inline-flex min-w-24 items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <span
          className="block h-full rounded-full bg-slate-700"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-xs tabular-nums text-slate-600">{percent}%</span>
    </span>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
