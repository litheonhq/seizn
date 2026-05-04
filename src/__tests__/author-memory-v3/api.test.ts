import { describe, expect, it } from 'vitest';

import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  handleAuthorEvalJobRequest,
  type AuthorMemoryV3Store,
} from '@/lib/author/memory-v3';

const basePayload = {
  schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  projectId: 'knot',
  runId: 'api-run-1',
  mode: 'record',
  records: [
    {
      id: 'fact-current-student',
      kind: 'world_rule',
      status: 'canon',
      content: 'Sori is a student.',
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
      },
      request: {
        kind: 'llm',
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        operation: 'answer-author-eval-case',
        input: {
          prompt: 'What is Sori in current canon?',
        },
      },
      liveOutput: {
        text: 'Sori is a student in the current canon.',
      },
    },
  ],
};

describe('Author Memory v3 API handler contract', () => {
  it('returns a stable success envelope for valid eval job payloads', async () => {
    const response = await handleAuthorEvalJobRequest(basePayload);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      run: {
        runId: 'api-run-1',
        projectId: 'knot',
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
      },
      results: [
        {
          caseId: 'case-current-role',
          passed: true,
          score: 1,
          failures: [],
        },
      ],
    });
  });

  it('maps contract errors to 400 responses', async () => {
    const response = await handleAuthorEvalJobRequest({
      ...basePayload,
      schemaVersion: 'wrong',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_CONTRACT_ERROR',
      },
    });
  });

  it('maps replay cache misses to 409 responses', async () => {
    const response = await handleAuthorEvalJobRequest({
      ...basePayload,
      mode: 'replay',
      cases: [{ ...basePayload.cases[0], liveOutput: undefined }],
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_REPLAY_MISS',
      },
    });
  });

  it('maps execution errors to a generic 500 response', async () => {
    const response = await handleAuthorEvalJobRequest(basePayload, {
      store: {
        saveRecords: async () => {
          throw new Error('relation "author_memory_v3_records" does not exist');
        },
      } as unknown as AuthorMemoryV3Store,
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_EXECUTION_ERROR',
        message: 'Author Memory v3 execution failed',
      },
    });
  });
});
