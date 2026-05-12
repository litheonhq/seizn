import { describe, expect, it, vi } from 'vitest';

import { STORY_LAYER_IDS } from '@/lib/author/frameworks';
import type { AuthorLlmRequest, AuthorLlmResponse } from '@/lib/author/llm/types';
import type {
  AuthorAuditLogEntry,
  AuthorAuditLogStore,
  AuthorAuditSearchFilter,
} from '@/lib/author/audit/types';
import { analyzeCoachInput, hashCoachInput } from '../analyze';
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

  it('persists a coach.analysis audit entry with hash + llmMeta', async () => {
    const { store, log, entries } = makeAuditStore();
    const generate = vi.fn(async () => makeLlmResponse({}));
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'Sample scene.' },
      { generate, auditStore: store }
    );
    expect(log).toHaveBeenCalledTimes(1);
    const entry = entries[0];
    expect(entry.eventType).toBe('coach.analysis');
    expect((entry.payload as { hash: string }).hash).toBe(hashCoachInput('Sample scene.'));
    expect(entry.llmMeta?.provider).toBe('anthropic');
    expect(entry.llmMeta?.operation).toBe('coach.analyze');
  });

  it('returns cached analysis without invoking the LLM on hash hit', async () => {
    const text = 'Cached scene.';
    const hash = hashCoachInput(text);
    const cachedEntry: AuthorAuditLogEntry = {
      id: 'audit-1',
      projectId: 'p',
      userId: 'u',
      eventType: 'coach.analysis',
      payload: {
        hash,
        analysis: {
          hash,
          storyLayers: STORY_LAYER_IDS.map((layer) => ({ layer, present: false, evidence: '' })),
          characterArcs: [],
          criticNotes: [],
          antiCliche: [],
          latencyMs: 200,
        },
      },
      decisionId: 'd-1',
      createdAt: new Date().toISOString(),
    };
    const { store, search } = makeAuditStore([cachedEntry]);
    const generate = vi.fn();
    const result = await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text },
      { generate: generate as never, auditStore: store }
    );
    expect(generate).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(true);
  });

  it('ignores cache entries older than the TTL window', async () => {
    const text = 'Stale cached scene.';
    const hash = hashCoachInput(text);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const staleEntry: AuthorAuditLogEntry = {
      id: 'audit-old',
      projectId: 'p',
      userId: 'u',
      eventType: 'coach.analysis',
      payload: {
        hash,
        analysis: {
          hash,
          storyLayers: STORY_LAYER_IDS.map((layer) => ({ layer, present: false, evidence: '' })),
          characterArcs: [],
          criticNotes: [],
          antiCliche: [],
          latencyMs: 0,
        },
      },
      decisionId: 'd-old',
      createdAt: eightDaysAgo,
    };
    const { store } = makeAuditStore([staleEntry]);
    const generate = vi.fn(async () => makeLlmResponse({}));
    const result = await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text },
      { generate, auditStore: store }
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
  });

  it('records computed latency in the audit entry payload', async () => {
    // now() is consumed three times: cache TTL cutoff, LLM start, LLM end.
    const times = [500, 1_000, 1_650];
    const now = vi.fn(() => new Date(times.shift() ?? 1_650));
    const { store, entries } = makeAuditStore();
    const generate = vi.fn(async () => makeLlmResponse({}));
    await analyzeCoachInput(
      { userId: 'u', projectId: 'p', text: 'timed scene' },
      { generate, auditStore: store, now }
    );
    const entry = entries[0];
    expect((entry.payload as { latencyMs: number }).latencyMs).toBe(650);
  });
});
