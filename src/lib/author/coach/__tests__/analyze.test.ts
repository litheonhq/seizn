import { describe, expect, it, vi } from 'vitest';

import { STORY_LAYER_IDS } from '@/lib/author/frameworks';
import type { AuthorLlmRequest, AuthorLlmResponse } from '@/lib/author/llm/types';
import type {
  AuthorAuditLogEntry,
  AuthorAuditLogStore,
  AuthorAuditSearchFilter,
} from '@/lib/author/audit/types';
import { analyzeCoachInput, CoachAnalyzeTimeoutError, hashCoachInput } from '../analyze';
import type { CoachLlmResponse } from '../schema';

function makeLlmResponse(json: Partial<CoachLlmResponse>): AuthorLlmResponse<CoachLlmResponse> {
  return {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    text: JSON.stringify(json),
    json: {
      storyLayers: json.storyLayers ?? [],
      characterArcs: json.characterArcs ?? [],
      criticNotes: json.criticNotes ?? [],
    },
    requestId: 'req-test',
    byok: false,
    usage: { tokensIn: 100, tokensOut: 100 },
  };
}

function makeAuditStore(entries: AuthorAuditLogEntry[] = []) {
  const log = vi.fn(async (entry: AuthorAuditLogEntry) => {
    entries.push(entry);
  });
  const search = vi.fn(async (_filter: AuthorAuditSearchFilter) => entries);
  const getByDecisionId = vi.fn(async () => undefined);
  const store: AuthorAuditLogStore = { log, search, getByDecisionId };
  return { store, log, search, entries };
}

describe('analyzeCoachInput', () => {
  it('returns an empty analysis for empty input without calling the LLM', async () => {
    const generate = vi.fn();
    const result = await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: '   ' },
      { generate: generate as never }
    );
    expect(generate).not.toHaveBeenCalled();
    expect(result.antiCliche).toEqual([]);
    expect(result.characterArcs).toEqual([]);
    expect(result.criticNotes).toEqual([]);
    expect(result.storyLayers).toHaveLength(STORY_LAYER_IDS.length);
    expect(result.storyLayers.every((entry) => entry.present === false)).toBe(true);
    expect(result.cached).toBe(false);
  });

  it('returns local cliche findings without LLM when text has cliches', async () => {
    const generate = vi.fn(async () => makeLlmResponse({ storyLayers: [], characterArcs: [], criticNotes: [] }));
    const result = await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'In a world where dragons rule, a chill ran down her spine.' },
      { generate }
    );
    expect(generate).toHaveBeenCalledTimes(1);
    const categories = new Set(result.antiCliche.map((f) => f.category));
    expect(categories.has('opening')).toBe(true);
    expect(categories.has('emotional')).toBe(true);
  });

  it('merges LLM story-layer findings into the canonical 7-layer shape', async () => {
    const generate = vi.fn(async () =>
      makeLlmResponse({
        storyLayers: [
          { layer: 'plot', present: true, evidence: 'opening conflict' },
          { layer: 'meaning', present: true, evidence: 'thematic question implicit' },
        ],
      })
    );
    const result = await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'The window shattered. He kept reading.' },
      { generate }
    );
    expect(result.storyLayers).toHaveLength(7);
    expect(result.storyLayers.find((l) => l.layer === 'plot')?.present).toBe(true);
    expect(result.storyLayers.find((l) => l.layer === 'meaning')?.present).toBe(true);
    expect(result.storyLayers.find((l) => l.layer === 'mystery')?.present).toBe(false);
  });

  it('passes effort=medium to the LLM for the performance bar', async () => {
    let captured: AuthorLlmRequest | null = null;
    const generate = vi.fn(async (request: AuthorLlmRequest) => {
      captured = request;
      return makeLlmResponse({});
    });
    await analyzeCoachInput({ userId: 'u', projectId: 'p', text: 'A short scene.' }, { generate });
    expect(captured).not.toBeNull();
    expect(captured!.effort).toBe('medium');
    expect(captured!.responseFormat).toBe('json');
    expect(captured!.jsonSchema).toBeDefined();
  });

  it('persists a coach.analysis audit entry with hash + counts + llmMeta (no user text)', async () => {
    const { store, log, entries } = makeAuditStore();
    const generate = vi.fn(async () =>
      makeLlmResponse({
        storyLayers: [{ layer: 'plot', present: true, evidence: 'opening conflict' }],
        characterArcs: [
          {
            characterName: 'Alice',
            inferredSacredFlaw: 'pride',
            inferredInternalNeed: 'humility',
            inferredExternalWant: 'win the contest',
            arcPhaseFit: 'rising',
            arcDirection: 'positive',
          },
        ],
        criticNotes: [
          { critic: 'layer_auditor', rating: 4, suggestions: ['tighten the third paragraph'] },
        ],
      }),
    );
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'Sample scene.' },
      { generate, auditStore: store },
    );
    expect(log).toHaveBeenCalledTimes(1);
    const entry = entries[0];
    expect(entry.eventType).toBe('coach.analysis');

    const payload = entry.payload as {
      hash: string;
      counts: { cliche: number; layers_present: number; character_arcs: number; critic_notes: number };
      latency_ms: number;
    };
    expect(payload.hash).toBe(hashCoachInput('Sample scene.'));
    expect(payload.counts).toEqual({ cliche: 0, layers_present: 1, character_arcs: 1, critic_notes: 1 });
    expect(typeof payload.latency_ms).toBe('number');

    // The payload must NOT contain user prose or LLM interpretation strings.
    const stringified = JSON.stringify(entry.payload);
    expect(stringified).not.toContain('pride');
    expect(stringified).not.toContain('Alice');
    expect(stringified).not.toContain('tighten');
    expect(stringified).not.toContain('opening conflict');

    expect(entry.llmMeta?.provider).toBe('anthropic');
    expect(entry.llmMeta?.operation).toBe('coach.analyze');
  });

  it('records computed latency in the trimmed audit entry payload', async () => {
    // now() is consumed twice: LLM start, LLM end.
    const times = [1_000, 1_650];
    const now = vi.fn(() => new Date(times.shift() ?? 1_650));
    const { store, entries } = makeAuditStore();
    const generate = vi.fn(async () => makeLlmResponse({}));
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'timed scene' },
      { generate, auditStore: store, now },
    );
    const entry = entries[0];
    expect((entry.payload as { latency_ms: number }).latency_ms).toBe(650);
  });

  it('re-runs the LLM on the same text (no cache lookup)', async () => {
    const { store } = makeAuditStore();
    const generate = vi.fn(async () => makeLlmResponse({}));
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'Same scene.' },
      { generate, auditStore: store },
    );
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'Same scene.' },
      { generate, auditStore: store },
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects with CoachAnalyzeTimeoutError when the LLM hangs past the timeout window', async () => {
    vi.useFakeTimers();
    try {
      // Promise that never resolves — simulates a hung LLM call.
      const generate = vi.fn(() => new Promise<AuthorLlmResponse<CoachLlmResponse>>(() => {}));
      const pending = analyzeCoachInput(
        { userId: 'u', projectId: 'p', text: 'A scene that hangs.' },
        { generate },
      );
      // Pre-attach the rejection handler so vitest doesn't flag it as
      // "unhandled" between the cache-lookup microtask flush and the timer
      // advance below.
      const assertion = expect(pending).rejects.toBeInstanceOf(CoachAnalyzeTimeoutError);
      // Async timer advance flushes microtasks — needed since the new Redis
      // cache lookup adds a microtask hop before the LLM-call timeout gets
      // registered.
      await vi.advanceTimersByTimeAsync(21_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
