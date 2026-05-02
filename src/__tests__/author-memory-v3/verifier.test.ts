import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyAuthorEvalVerifierResult,
  createAnthropicAuthorEvalVerifier,
  InMemoryAuthorSideEffectStore,
  runAuthorEvalCase,
  type AuthorEvalCase,
  type AuthorEvalResult,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

const testCase: AuthorEvalCase = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  id: 'case-current-role',
  kind: 'invalidated_fact_exclusion',
  prompt: 'What is Sori in current canon?',
  expected: {
    mustInclude: ['student'],
    mustExclude: ['agent'],
  },
};

const records: AuthorMemoryRecord[] = [
  {
    id: 'fact-current-student',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is a student.',
  },
];

const request: AuthorSideEffectRequest = {
  kind: 'llm',
  provider: 'anthropic',
  model: 'claude-opus-4.7',
  operation: 'answer-author-eval-case',
  input: {
    prompt: testCase.prompt,
  },
};

const baseResult: AuthorEvalResult = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  caseId: testCase.id,
  passed: true,
  score: 1,
  memorySnapshotHash: 'snapshot-1',
  sideEffectKeys: ['side-effect-1'],
  output: 'Sori is a student.',
  failures: [],
};

describe('Author Memory v3 verifier adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges verifier failures into the deterministic eval result', () => {
    const merged = applyAuthorEvalVerifierResult(baseResult, {
      passed: false,
      score: 0.25,
      failures: ['relationship evidence missing'],
      metadata: {
        kind: 'test_verifier',
      },
    });

    expect(merged).toMatchObject({
      passed: false,
      score: 0.25,
      failures: ['relationship evidence missing'],
      metadata: {
        verifier: {
          passed: false,
          score: 0.25,
          kind: 'test_verifier',
        },
      },
    });
  });

  it('lets a verifier fail a runner case after lexical checks pass', async () => {
    const output = await runAuthorEvalCase({
      testCase,
      records,
      request,
      mode: 'record',
      store: new InMemoryAuthorSideEffectStore(),
      live: () => ({ text: 'Sori is a student.' }),
      verifier: {
        verify: () => ({
          passed: false,
          score: 0,
          failures: ['judge rejected canon support'],
          metadata: {
            kind: 'test_verifier',
          },
        }),
      },
    });

    expect(output.result.passed).toBe(false);
    expect(output.result.score).toBe(0);
    expect(output.result.failures).toContain('judge rejected canon support');
    expect(output.fall.debug.authorMemoryV3.metadata).toMatchObject({
      verifier: {
        kind: 'test_verifier',
      },
    });
  });

  it('fails closed when the Anthropic judge is not configured', async () => {
    const verifier = createAnthropicAuthorEvalVerifier({ apiKey: '' });
    const result = await verifier.verify({
      testCase,
      output: 'Sori is a student.',
      records,
      snapshot: {
        schemaVersion: 'seizn.author_memory_v3.v1',
        projectId: 'knot',
        snapshotHash: 'snapshot-1',
        itemCount: 1,
        recordHashes: {},
        records,
      },
      sideEffect: {
        key: 'side-effect-1',
        request,
        output: {
          text: 'Sori is a student.',
        },
        capturedAt: '2026-05-02T00:00:00.000Z',
      },
    });

    expect(result).toMatchObject({
      passed: false,
      score: 0,
      failures: ['author eval judge is not configured'],
      metadata: {
        kind: 'anthropic_author_eval_judge',
        configured: false,
      },
    });
  });

  it('parses compact JSON from the Anthropic judge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              text: JSON.stringify({
                passed: true,
                score: 0.9,
                failures: [],
                explanation: 'Canon and character knowledge are consistent.',
              }),
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const verifier = createAnthropicAuthorEvalVerifier({
      apiKey: 'test-api-key',
      model: 'test-judge-model',
    });
    const result = await verifier.verify({
      testCase,
      output: 'Sori is a student.',
      records,
      snapshot: {
        schemaVersion: 'seizn.author_memory_v3.v1',
        projectId: 'knot',
        snapshotHash: 'snapshot-1',
        itemCount: 1,
        recordHashes: {},
        records,
      },
      sideEffect: {
        key: 'side-effect-1',
        request,
        output: {
          text: 'Sori is a student.',
        },
        capturedAt: '2026-05-02T00:00:00.000Z',
      },
    });

    expect(result).toMatchObject({
      passed: true,
      score: 0.9,
      failures: [],
      metadata: {
        kind: 'anthropic_author_eval_judge',
        configured: true,
        model: 'test-judge-model',
        explanation: 'Canon and character knowledge are consistent.',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
