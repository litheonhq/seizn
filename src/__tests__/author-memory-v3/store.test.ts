import { describe, expect, it } from 'vitest';

import {
  InMemoryAuthorMemoryV3Store,
  createAuthorSideEffectKey,
  type AuthorEvalResult,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

const records: AuthorMemoryRecord[] = [
  {
    id: 'person-sori',
    kind: 'person',
    status: 'canon',
    content: 'Sori is the current protagonist.',
    entityIds: ['sori'],
  },
  {
    id: 'rule-retired',
    kind: 'world_rule',
    status: 'invalidated',
    content: 'Sori is a field agent.',
    entityIds: ['sori'],
  },
];

const request: AuthorSideEffectRequest = {
  kind: 'llm',
  provider: 'anthropic',
  model: 'claude-opus-4.7',
  operation: 'answer-author-eval-case',
  input: { prompt: 'Who is Sori?' },
};

const result: AuthorEvalResult = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  caseId: 'case-sori',
  passed: true,
  score: 1,
  memorySnapshotHash: 'snapshot-hash',
  sideEffectKeys: ['side-effect-key'],
  output: 'Sori is the current protagonist.',
  failures: [],
};

describe('Author Memory v3 store contract', () => {
  it('stores records by project and supports scoped filters', async () => {
    const store = new InMemoryAuthorMemoryV3Store();

    await store.saveRecords({ projectId: 'knot', records, mode: 'replace' });

    expect(await store.listRecords('knot', { entityId: 'sori' })).toHaveLength(2);
    expect(await store.listRecords('knot', { status: 'canon' })).toEqual([records[0]]);
    expect(await store.getRecord('knot', 'person-sori')).toEqual(records[0]);
    expect(await store.getRecord('other-project', 'person-sori')).toBeNull();
  });

  it('creates and retrieves snapshots from stored project records', async () => {
    const store = new InMemoryAuthorMemoryV3Store();

    await store.saveRecords({ projectId: 'knot', records, mode: 'replace' });
    const snapshot = await store.createSnapshot({
      projectId: 'knot',
      generatedAt: '2026-05-02T00:00:00.000Z',
    });

    await expect(store.getSnapshot('knot', snapshot.snapshotHash)).resolves.toEqual(snapshot);
    expect(snapshot.itemCount).toBe(2);
  });

  it('acts as a replay side-effect store', () => {
    const store = new InMemoryAuthorMemoryV3Store();
    const key = createAuthorSideEffectKey(request);

    store.put({
      key,
      request,
      output: { text: 'recorded' },
      capturedAt: '2026-05-02T00:00:00.000Z',
    });

    expect(store.get(key)?.output).toEqual({ text: 'recorded' });
    expect(store.allSideEffects().map((record) => record.key)).toEqual([key]);
  });

  it('persists eval results by run id', async () => {
    const store = new InMemoryAuthorMemoryV3Store();

    await store.saveEvalResult({
      projectId: 'knot',
      runId: 'run-1',
      result,
      createdAt: '2026-05-02T00:00:00.000Z',
    });

    const stored = await store.listEvalResults('knot', 'run-1');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: 'run-1:case-sori',
      projectId: 'knot',
      runId: 'run-1',
      result,
    });
  });
});
