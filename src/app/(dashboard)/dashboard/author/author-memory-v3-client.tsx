'use client';

import { type ChangeEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  FileText,
  GitBranch,
  Play,
  RefreshCw,
  Sparkles,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import {
  useAuthorCandidates,
  useAuthorCharacters,
  useAuthorConflicts,
  useAuthorGraph,
  useAuthorImports,
  useAuthorProjects,
  useAuthorSettings,
  useAuthorTimeline,
  useGenerateAuthorBacklog,
  useRunAuthorSimulation,
  useAuthorSimulation,
  useUploadAuthorImport,
} from '@/hooks/useAuthorMemoryV3';

type JsonRecord = Record<string, unknown>;

const screens = [
  { id: 'inbox', label: 'Inbox', icon: FileText },
  { id: 'review', label: 'Review', icon: RefreshCw },
  { id: 'characters', label: 'Characters', icon: UserRound },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
  { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
  { id: 'simulate', label: 'Simulate', icon: Play },
] as const;

export function AuthorMemoryV3Client() {
  const [screen, setScreen] = useState<(typeof screens)[number]['id']>('review');
  const [simulationId, setSimulationId] = useState<string | undefined>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>();
  const [backlogResult, setBacklogResult] = useState<JsonRecord | null>(null);
  const projects = useAuthorProjects();
  const projectId = String(projects.data?.projects?.[0]?.id ?? 'knot');
  const imports = useAuthorImports(projectId);
  const candidates = useAuthorCandidates(projectId, { status: 'candidate', page_size: 12 });
  const characters = useAuthorCharacters(projectId);
  const graph = useAuthorGraph(projectId);
  const timeline = useAuthorTimeline(projectId);
  const conflicts = useAuthorConflicts(projectId, { status: 'open' });
  const settings = useAuthorSettings(projectId);
  const runSimulation = useRunAuthorSimulation(projectId);
  const simulation = useAuthorSimulation(projectId, simulationId);
  const uploadImport = useUploadAuthorImport(projectId);
  const activeCharacterId = selectedCharacterId ?? String(characters.data?.characters?.[0]?.id ?? '');
  const generateBacklog = useGenerateAuthorBacklog(projectId, activeCharacterId || undefined);
  const currentProject = projects.data?.projects?.[0];
  const [uploadRole, setUploadRole] = useState('canon');
  const [uploadMode, setUploadMode] = useState('extract');
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    const result = await generateBacklog.trigger({
      categories: ['좋아하는 것', '싫어하는 것', '작은 보상', '작은 짜증'],
      items_per_category: 5,
    });
    setBacklogResult(result);
    setScreen('characters');
  }

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
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={runSimulation.isMutating}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Run Scene
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="Imports" value={counts.imports} />
            <Metric label="Candidates" value={counts.candidates} />
            <Metric label="Characters" value={counts.characters} />
            <Metric label="Conflicts" value={counts.conflicts} danger={counts.conflicts > 0} />
            <Metric label="Edges" value={counts.graphEdges} />
            <Metric label="Events" value={counts.events} />
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
            <Panel title="Document Inbox">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label
                  aria-disabled={uploadImport.isMutating}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                >
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  Upload
                  <input
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
                  <span className="text-sm text-slate-600">Uploading</span>
                ) : null}
                {uploadError ? (
                  <span className="text-sm text-red-700">{uploadError}</span>
                ) : null}
              </div>
              <Rows
                rows={imports.data?.imports ?? []}
                columns={['file_name', 'source_role', 'parse_status', 'extract_status', 'candidate_count', 'parsed_text_preview', 'error_message']}
              />
            </Panel>
          ) : null}
          {!isLoading && screen === 'review' ? (
            <Panel title="Review Queue">
              <Rows rows={candidates.data?.candidates ?? []} columns={['id', 'type', 'status', 'confidence']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'characters' ? (
            <Panel title="Characters">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <select
                  value={activeCharacterId}
                  onChange={(event) => {
                    setSelectedCharacterId(event.target.value);
                    setBacklogResult(null);
                  }}
                  className="min-h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {(characters.data?.characters ?? []).map((character) => (
                    <option key={String(character.id)} value={String(character.id)}>
                      {String(character.name)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleGenerateBacklog}
                  disabled={!activeCharacterId || generateBacklog.isMutating}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Generate backlog
                </button>
                {generateBacklog.error ? (
                  <span className="text-sm text-red-700">{generateBacklog.error.message}</span>
                ) : null}
              </div>
              {backlogResult ? (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                  <div className="font-medium">
                    {String(backlogResult.character_name)} backlog generated · {Number((backlogResult.candidates as unknown[] | undefined)?.length ?? 0)} candidates
                  </div>
                  <div className="mt-1 text-emerald-900">Review Queue updated.</div>
                  <div className="mt-3">
                    <Rows
                      rows={((backlogResult.candidates as JsonRecord[] | undefined) ?? []).slice(0, 8)}
                      columns={['category', 'content', 'rationale']}
                    />
                  </div>
                </div>
              ) : null}
              <Rows rows={characters.data?.characters ?? []} columns={['name', 'summary']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'graph' ? (
            <Panel title="Relationship Graph Data">
              <Rows rows={graph.data?.edges?.slice(0, 12) ?? []} columns={['from', 'type', 'to', 'intensity']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'timeline' ? (
            <Panel title="Timeline">
              <Rows rows={timeline.data?.events?.slice(0, 16) ?? []} columns={['day', 'date', 'where', 'what']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'conflicts' ? (
            <Panel title="Conflict Inbox">
              <Rows rows={conflicts.data?.conflicts ?? []} columns={['id', 'severity', 'status', 'impact_summary']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'simulate' ? (
            <Panel title="Scene Simulation">
              {simulationId ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="font-medium">Simulation {simulationId}</div>
                    <div className="mt-1 text-slate-600">
                      Status: {String(simulation.data?.status ?? 'loading')} · Candidates: {Number((simulation.data?.candidates as unknown[] | undefined)?.length ?? 0)}
                    </div>
                  </div>
                  <Rows
                    rows={(simulation.data?.candidates as JsonRecord[] | undefined) ?? []}
                    columns={['candidate_id', 'rank']}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                  Run a scene to generate candidate thoughts, dialogue, and actions from current memory.
                </div>
              )}
            </Panel>
          ) : null}
          {settings.error ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Settings could not be loaded. The API surface is still available for direct contract testing.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: unknown; danger?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${danger ? 'text-red-700' : 'text-slate-950'}`}>
        {String(value)}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Rows({ rows, columns }: { rows: JsonRecord[]; columns: string[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
        No rows
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column.replaceAll('_', ' ')}
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
