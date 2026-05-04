import { describe, expect, it } from 'vitest';
import {
  createAuthorAuditLogEntry,
  hashAuthorAuditPrompt,
  InMemoryAuthorAuditLogStore,
  replayAuthorAuditChain,
  replayAuthorAuditDecision,
} from '@/lib/author/audit';

describe('Author audit replay', () => {
  it('replays a deterministic decision chain by parent decision id', async () => {
    const store = new InMemoryAuthorAuditLogStore();
    const root = createAuthorAuditLogEntry({
      userId: 'author-1',
      projectId: 'knot',
      eventType: 'simulation.run',
      payload: {
        simulation_id: 'sim-1',
        deterministic: true,
        api_key: 'raw-secret-test-value',
      },
      llmMeta: {
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        prompt_hash: hashAuthorAuditPrompt('scene prompt'),
        tokens_in: 10,
        tokens_out: 4,
      },
      createdAt: '2026-05-02T00:00:00.000Z',
    });
    const child = createAuthorAuditLogEntry({
      userId: 'author-1',
      projectId: 'knot',
      eventType: 'candidate.added',
      payload: { candidate_id: 'candidate-1', deterministic: true },
      parentDecisionId: root.decisionId,
      createdAt: '2026-05-02T00:00:01.000Z',
    });

    store.log(root);
    store.log(child);

    const replay = await replayAuthorAuditDecision(store, {
      projectId: 'knot',
      decisionId: root.decisionId,
    });

    expect(replay.replayStatus).toBe('deterministic');
    expect(replay.chain.map((entry) => entry.decisionId)).toEqual([root.decisionId, child.decisionId]);
    expect(replay.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(replay)).not.toContain('raw-secret-test-value');
    expect((root.payload as Record<string, unknown>).api_key).toBe('[redacted]');
  });

  it('marks replay as drift risk when deterministic metadata is missing or false', () => {
    const entry = createAuthorAuditLogEntry({
      userId: 'author-1',
      projectId: 'knot',
      eventType: 'simulation.run',
      payload: { simulation_id: 'sim-2', deterministic: false },
      createdAt: '2026-05-02T00:00:00.000Z',
    });

    const replay = replayAuthorAuditChain([entry], entry.decisionId);

    expect(replay.replayStatus).toBe('drift_risk');
    expect(replay.warnings).toEqual(expect.arrayContaining([
      `non_deterministic:${entry.decisionId}`,
      `missing_prompt_hash:${entry.decisionId}`,
    ]));
  });
});
