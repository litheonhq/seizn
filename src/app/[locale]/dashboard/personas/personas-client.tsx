'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  Database,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

export type PersonaDashboardCopy = {
  title: string;
  subtitle: string;
  planBadge: string;
  planBadgeUnlimited: string;
  filters: {
    region: string;
    occupation: string;
    occupationPlaceholder: string;
    lifeStage: string;
    ageRange: string;
    count: string;
    preview: string;
  };
  lifeStages: Record<string, string>;
  modes: {
    hybrid: string;
    auto: string;
    manual: string;
  };
  actions: {
    autoAcceptAll: string;
    manualReviewEach: string;
    seedSelected: string;
    previewOnly: string;
    loading: string;
  };
  list: {
    title: string;
    empty: string;
    accepted: string;
    skipped: string;
  };
  status: {
    inserted: string;
    previewLoaded: string;
    failed: string;
  };
  attribution: string;
  attributionUrlLabel: string;
};

type SeedMode = 'auto' | 'manual' | 'hybrid';

type PersonaPreview = {
  id: string;
  name: string;
  age: number;
  occupation: string;
  province: string;
  district: string;
  lifeStage: string;
  summary: string;
};

const REGIONS = [
  '',
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];

const LIFE_STAGE_KEYS = ['all', 'young_adult', 'adult', 'middle', 'senior'];
const DATASET_ATTRIBUTION = 'Powered by Nemotron-Personas-Korea (NVIDIA, CC BY 4.0)';

export function PersonaSeedingClient({ copy }: { copy: PersonaDashboardCopy }) {
  const [region, setRegion] = useState('');
  const [occupation, setOccupation] = useState('');
  const [lifeStage, setLifeStage] = useState('all');
  const [ageMin, setAgeMin] = useState(19);
  const [ageMax, setAgeMax] = useState(94);
  const [count, setCount] = useState(12);
  const [mode, setMode] = useState<SeedMode>('hybrid');
  const [previews, setPreviews] = useState<PersonaPreview[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedCount = useMemo(() => {
    if (mode === 'auto') return count;
    if (mode === 'manual') return 0;
    return accepted.size;
  }, [accepted.size, count, mode]);

  const criteria = useMemo(
    () => ({
      region: region || undefined,
      occupation: occupation || undefined,
      lifeStage: lifeStage === 'all' ? undefined : lifeStage,
      ageRange: [Math.min(ageMin, ageMax), Math.max(ageMin, ageMax)] as [number, number],
    }),
    [ageMax, ageMin, lifeStage, occupation, region],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('count', String(count));
    if (region) params.set('region', region);
    if (occupation) params.set('occupation', occupation);
    if (lifeStage !== 'all') params.set('lifeStage', lifeStage);
    params.set('ageMin', String(Math.min(ageMin, ageMax)));
    params.set('ageMax', String(Math.max(ageMin, ageMax)));
    return params.toString();
  }, [ageMax, ageMin, count, lifeStage, occupation, region]);

  async function loadPreview() {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/personas/preview?${queryString}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || copy.status.failed);
      const rows = body.personas as PersonaPreview[];
      setPreviews(rows);
      setLimit(typeof body.limit === 'number' ? body.limit : null);
      setAccepted(new Set(rows.map((row) => row.id)));
      setStatus(copy.status.previewLoaded.replace('{count}', String(rows.length)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.status.failed);
    } finally {
      setLoading(false);
    }
  }

  async function seedPersonas() {
    setLoading(true);
    setStatus(null);
    try {
      const selections =
        mode === 'hybrid'
          ? previews.map((preview) => ({ personaId: preview.id, accept: accepted.has(preview.id) }))
          : undefined;

      const response = await fetch('/api/personas/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, criteria, mode, selections }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || copy.status.failed);

      if (Array.isArray(body.previews)) {
        setPreviews(body.previews);
      }
      setStatus(copy.status.inserted.replace('{count}', String(body.inserted?.length || 0)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.status.failed);
    } finally {
      setLoading(false);
    }
  }

  function setAllAccepted(value: boolean) {
    setAccepted(value ? new Set(previews.map((preview) => preview.id)) : new Set());
  }

  function toggleAccepted(id: string) {
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-szn-bg px-4 py-6 text-szn-text-1 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-szn-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-szn-text-2">
              <Sparkles className="h-3.5 w-3.5 text-szn-signal" />
              Persona seeding
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{copy.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-szn-text-2">{copy.subtitle}</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {limit === -1
              ? copy.planBadgeUnlimited
              : copy.planBadge.replace('{limit}', String(limit ?? count))}
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="border border-szn-border-subtle bg-szn-surface-1 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-szn-signal" />
              {copy.filters.preview}
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-szn-text-2">{copy.filters.region}</span>
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm outline-none focus:border-szn-signal"
                >
                  {REGIONS.map((item) => (
                    <option key={item || 'all'} value={item}>
                      {item || 'All'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-szn-text-2">{copy.filters.occupation}</span>
                <div className="flex items-center border border-szn-border-subtle bg-szn-bg px-3 py-2 focus-within:border-szn-signal">
                  <Search className="mr-2 h-4 w-4 text-szn-text-3" />
                  <input aria-label="Occupation"
                    value={occupation}
                    onChange={(event) => setOccupation(event.target.value)}
                    placeholder={copy.filters.occupationPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-szn-text-3"
                  />
                </div>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm text-szn-text-2">{copy.filters.lifeStage}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {LIFE_STAGE_KEYS.map((key) => (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${
                        lifeStage === key
                          ? 'border-szn-signal bg-szn-signal/10 text-szn-text-1'
                          : 'border-szn-border-subtle bg-szn-bg text-szn-text-2'
                      }`}
                    >
                      <input aria-label="Life Stage"
                        type="radio"
                        name="lifeStage"
                        value={key}
                        checked={lifeStage === key}
                        onChange={() => setLifeStage(key)}
                        className="h-3.5 w-3.5"
                      />
                      {copy.lifeStages[key]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-szn-text-2">
                  <span>{copy.filters.ageRange}</span>
                  <span>
                    {Math.min(ageMin, ageMax)}-{Math.max(ageMin, ageMax)}
                  </span>
                </div>
                <input aria-label="Age Min slider"
                  type="range"
                  min={19}
                  max={94}
                  value={ageMin}
                  onChange={(event) => setAgeMin(Number(event.target.value))}
                  className="w-full accent-szn-signal"
                />
                <input aria-label="Age Max slider"
                  type="range"
                  min={19}
                  max={94}
                  value={ageMax}
                  onChange={(event) => setAgeMax(Number(event.target.value))}
                  className="w-full accent-szn-signal"
                />
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-szn-text-2">{copy.filters.count}</span>
                <input aria-label="Count"
                  type="number"
                  min={1}
                  max={limit && limit > 0 ? limit : 5000}
                  value={count}
                  onChange={(event) => setCount(Math.max(1, Number(event.target.value)))}
                  className="w-full border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm outline-none focus:border-szn-signal"
                />
              </label>

              <button
                type="button"
                onClick={loadPreview}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 bg-szn-signal px-4 py-2.5 text-sm font-medium text-szn-signal-fg disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? copy.actions.loading : copy.filters.preview}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 border border-szn-border-subtle bg-szn-surface-1 p-4 md:flex-row md:items-center md:justify-between">
              <div className="grid grid-cols-3 gap-2">
                {(['hybrid', 'auto', 'manual'] as SeedMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`inline-flex items-center justify-center gap-2 border px-3 py-2 text-sm ${
                      mode === item
                        ? 'border-szn-signal bg-szn-signal/10 text-szn-text-1'
                        : 'border-szn-border-subtle bg-szn-bg text-szn-text-2'
                    }`}
                  >
                    {item === 'auto' ? <Sparkles className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    {copy.modes[item]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('auto');
                    setAllAccepted(true);
                  }}
                  className="inline-flex items-center gap-2 border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-2"
                >
                  <Check className="h-4 w-4 text-emerald-400" />
                  {copy.actions.autoAcceptAll}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('manual');
                    setAllAccepted(false);
                  }}
                  className="inline-flex items-center gap-2 border border-szn-border-subtle bg-szn-bg px-3 py-2 text-sm text-szn-text-2"
                >
                  <X className="h-4 w-4 text-amber-300" />
                  {copy.actions.manualReviewEach}
                </button>
                <button
                  type="button"
                  onClick={seedPersonas}
                  disabled={loading || (mode === 'hybrid' && selectedCount === 0)}
                  className="inline-flex items-center gap-2 bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  <Database className="h-4 w-4" />
                  {mode === 'manual'
                    ? copy.actions.previewOnly
                    : copy.actions.seedSelected.replace('{count}', String(selectedCount))}
                </button>
              </div>
            </div>

            {status && (
              <div className="border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
                {status}
              </div>
            )}

            <section className="border border-szn-border-subtle bg-szn-surface-1">
              <div className="flex items-center justify-between border-b border-szn-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium">{copy.list.title}</h2>
                <span className="text-xs text-szn-text-3">
                  {previews.length} / {count}
                </span>
              </div>

              {previews.length === 0 ? (
                <div className="px-4 py-14 text-center text-sm text-szn-text-2">{copy.list.empty}</div>
              ) : (
                <div className="divide-y divide-szn-border-subtle">
                  {previews.map((preview) => {
                    const isAccepted = accepted.has(preview.id);
                    return (
                      <article key={preview.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px]">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-medium">{preview.name}</h3>
                            <span className="border border-szn-border-subtle px-2 py-0.5 text-xs text-szn-text-2">
                              {preview.age} / {copy.lifeStages[preview.lifeStage] || preview.lifeStage}
                            </span>
                            <span className="border border-szn-border-subtle px-2 py-0.5 text-xs text-szn-text-2">
                              {preview.province} {preview.district}
                            </span>
                          </div>
                          <p className="text-sm text-szn-text-2">{preview.occupation}</p>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-szn-text-2">{preview.summary}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAccepted(preview.id)}
                          disabled={mode === 'auto'}
                          className={`inline-flex h-10 items-center justify-center gap-2 self-start border px-3 text-sm ${
                            isAccepted
                              ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                              : 'border-szn-border-subtle bg-szn-bg text-szn-text-2'
                          } disabled:opacity-70`}
                        >
                          {isAccepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          {isAccepted ? copy.list.accepted : copy.list.skipped}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </section>

        <footer className="border-t border-szn-border-subtle pt-4 text-sm text-szn-text-2">
          <a
            href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea"
            target="_blank"
            rel="noreferrer"
            className="text-szn-signal hover:text-szn-text-1"
          >
            {copy.attribution || DATASET_ATTRIBUTION}
          </a>
          <span className="ml-2 text-szn-text-3">{copy.attributionUrlLabel}</span>
        </footer>
      </div>
    </main>
  );
}
