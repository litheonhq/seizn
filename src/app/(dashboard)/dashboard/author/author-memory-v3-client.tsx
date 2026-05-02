'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  FileText,
  GitBranch,
  Play,
  RefreshCw,
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
  useRunAuthorSimulation,
  useAuthorSimulation,
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
  const currentProject = projects.data?.projects?.[0];

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
              <Rows rows={imports.data?.imports ?? []} columns={['file_name', 'source_role', 'parse_status', 'candidate_count']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'review' ? (
            <Panel title="Review Queue">
              <Rows rows={candidates.data?.candidates ?? []} columns={['id', 'type', 'status', 'confidence']} />
            </Panel>
          ) : null}
          {!isLoading && screen === 'characters' ? (
            <Panel title="Characters">
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
