import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  InMemoryAuthorMemoryV3Store,
  runKnotAuthorEvalFixture,
  type KnotInputBundle,
} from '@/lib/author/memory-v3';

const root = process.cwd();
const evalSeedSource = 'docs/knot-input/knot_author_eval_seed_v3.json';

describe('KNOT v3 Author eval fixture runner', () => {
  it('runs the v3 100-case fixture in record and replay modes', async () => {
    const bundle = loadKnotV3Bundle();
    const store = new InMemoryAuthorMemoryV3Store();
    const generatedAt = '2026-05-02T00:00:00.000Z';
    const capturedAt = '2026-05-02T00:00:00.000Z';

    const recorded = await runKnotAuthorEvalFixture({
      projectId: 'knot',
      runId: 'knot-v3-record',
      bundle,
      store,
      mode: 'record',
      generatedAt,
      capturedAt,
      evalSeedSource,
      includeLiveOutput: true,
    });

    expect(recorded.summary).toMatchObject({
      runId: 'knot-v3-record',
      projectId: 'knot',
      totalCases: 100,
      passedCases: 100,
      failedCases: 0,
      averageScore: 1,
    });
    expect(recorded.summary.sideEffectKeys).toHaveLength(100);

    const replayed = await runKnotAuthorEvalFixture({
      projectId: 'knot',
      runId: 'knot-v3-replay',
      bundle,
      store,
      mode: 'replay',
      generatedAt,
      capturedAt,
      evalSeedSource,
      includeLiveOutput: false,
    });

    expect(replayed.summary).toMatchObject({
      runId: 'knot-v3-replay',
      projectId: 'knot',
      totalCases: 100,
      passedCases: 100,
      failedCases: 0,
      averageScore: 1,
      memorySnapshotHash: recorded.summary.memorySnapshotHash,
    });
    expect(replayed.summary.sideEffectKeys).toEqual(recorded.summary.sideEffectKeys);
  });
});

function loadKnotV3Bundle(): KnotInputBundle {
  return {
    characterRegistry: readJson('docs/knot-input/character_registry.json'),
    worldRuleRegistry: readJson('docs/knot-input/world_rule_registry.json'),
    relationshipMatrix: readJson('docs/knot-input/relationship_matrix.json'),
    timelineEventLedger: readJson('docs/knot-input/timeline_event_ledger.json'),
    evalSeed: readJson(evalSeedSource),
  };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}
