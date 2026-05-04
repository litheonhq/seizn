import { describe, expect, it } from 'vitest';

import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  AuthorMemoryV3ContractError,
  InMemoryAuthorMemoryV3Store,
  parseAuthorEvalJobPayload,
  runAuthorEvalJobPayload,
} from '@/lib/author/memory-v3';

const payload = {
  schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  projectId: 'knot',
  runId: 'run-from-payload',
  mode: 'record',
  generatedAt: '2026-05-02T00:00:00.000Z',
  capturedAt: '2026-05-02T00:00:00.000Z',
  records: [
    {
      id: 'fact-current-student',
      kind: 'world_rule',
      status: 'canon',
      content: 'Sori is a student.',
      source: {
        sourceId: 'knot-source-1',
        start: 0,
        end: 18,
      },
      entityIds: ['sori'],
      metadata: {
        authority: 'locked',
      },
    },
  ],
  cases: [
    {
      testCase: {
        schemaVersion: 'seizn.knot_author_eval.v1',
        id: 'case-current-role',
        kind: 'invalidated_fact_exclusion',
        prompt: 'What is Sori in current canon?',
        expected: {
          mustInclude: ['student'],
          mustExclude: ['agent'],
        },
        tags: ['knot'],
      },
      request: {
        kind: 'llm',
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        operation: 'answer-author-eval-case',
        input: {
          prompt: 'What is Sori in current canon?',
        },
        params: {
          temperature: 0,
        },
      },
      liveOutput: {
        text: 'Sori is a student in the current canon.',
      },
    },
  ],
};

describe('Author Memory v3 runtime contract', () => {
  it('parses a valid eval job payload', () => {
    const parsed = parseAuthorEvalJobPayload(payload);

    expect(parsed).toMatchObject({
      schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
      projectId: 'knot',
      runId: 'run-from-payload',
      mode: 'record',
    });
    expect(parsed.records[0]).toMatchObject({
      id: 'fact-current-student',
      kind: 'world_rule',
      status: 'canon',
    });
    expect(parsed.cases[0].testCase.id).toBe('case-current-role');
  });

  it('rejects malformed payloads with actionable issues', () => {
    expect(() =>
      parseAuthorEvalJobPayload({
        schemaVersion: 'wrong',
        projectId: '',
        mode: 'live',
        records: [{ id: 'x', kind: 'unsupported', status: 'canon', content: 'x' }],
        cases: [],
      })
    ).toThrow(AuthorMemoryV3ContractError);

    try {
      parseAuthorEvalJobPayload({
        schemaVersion: 'wrong',
        projectId: '',
        mode: 'live',
        records: [{ id: 'x', kind: 'unsupported', status: 'canon', content: 'x' }],
        cases: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorMemoryV3ContractError);
      expect((error as AuthorMemoryV3ContractError).issues).toEqual(
        expect.arrayContaining([
          'payload.projectId must be a non-empty string',
          `payload.schemaVersion must be ${AUTHOR_MEMORY_V3_SCHEMA_VERSION}`,
          'payload.mode must be record, replay, or off',
          'payload.records[0].kind is not supported',
        ])
      );
    }
  });

  it('runs a deterministic eval job from payload liveOutput', async () => {
    const store = new InMemoryAuthorMemoryV3Store();
    const parsed = parseAuthorEvalJobPayload(payload);
    const output = await runAuthorEvalJobPayload({ payload: parsed, store });

    expect(output.summary).toMatchObject({
      runId: 'run-from-payload',
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
    });
    await expect(store.listEvalResults('knot', 'run-from-payload')).resolves.toHaveLength(1);
  });

  it('fails closed when record mode payload omits liveOutput', async () => {
    const parsed = parseAuthorEvalJobPayload({
      ...payload,
      cases: [{ ...payload.cases[0], liveOutput: undefined }],
    });

    await expect(
      runAuthorEvalJobPayload({
        payload: parsed,
        store: new InMemoryAuthorMemoryV3Store(),
      })
    ).rejects.toThrow('missing liveOutput');
  });
});
