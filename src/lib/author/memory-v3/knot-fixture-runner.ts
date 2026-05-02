import type { JsonValue } from './canonical';
import { runAuthorEvalJobPayload, type AuthorEvalJobPayload } from './contract';
import {
  knotInputBundleToAuthorEvalJobPayload,
  type KnotInputBundle,
} from './knot-input';
import {
  InMemoryAuthorMemoryV3Store,
  type AuthorMemoryV3Store,
} from './store';
import type { AuthorEvalCase } from './types';
import type { AuthorEvalVerifier } from './verifier';

export function createAuthorEvalFixtureLiveOutput(testCase: AuthorEvalCase): JsonValue {
  const text = [
    ...(testCase.expected.mustInclude ?? []),
    ...(testCase.expected.allowedUnknowns ?? []),
  ].join('\n').trim();

  return {
    text: text.length > 0 ? text : testCase.prompt,
    fixture: true,
    caseId: testCase.id,
  };
}

export function createKnotAuthorEvalFixturePayload(params: {
  projectId: string;
  bundle: KnotInputBundle;
  runId?: string;
  mode?: AuthorEvalJobPayload['mode'];
  generatedAt?: string;
  capturedAt?: string;
  evalSeedSource?: string;
  includeLiveOutput?: boolean;
}): AuthorEvalJobPayload {
  const payload = knotInputBundleToAuthorEvalJobPayload({
    projectId: params.projectId,
    runId: params.runId,
    bundle: params.bundle,
    mode: params.mode ?? 'record',
    generatedAt: params.generatedAt,
    capturedAt: params.capturedAt,
    evalSeedSource: params.evalSeedSource,
  });

  if (params.includeLiveOutput === false) {
    return payload;
  }

  return {
    ...payload,
    cases: payload.cases.map((jobCase) => ({
      ...jobCase,
      liveOutput: createAuthorEvalFixtureLiveOutput(jobCase.testCase),
    })),
  };
}

export async function runKnotAuthorEvalFixture(params: {
  projectId: string;
  bundle: KnotInputBundle;
  store?: AuthorMemoryV3Store;
  runId?: string;
  mode?: AuthorEvalJobPayload['mode'];
  generatedAt?: string;
  capturedAt?: string;
  evalSeedSource?: string;
  includeLiveOutput?: boolean;
  verifier?: AuthorEvalVerifier;
}) {
  const store = params.store ?? new InMemoryAuthorMemoryV3Store();
  const payload = createKnotAuthorEvalFixturePayload({
    projectId: params.projectId,
    bundle: params.bundle,
    runId: params.runId,
    mode: params.mode,
    generatedAt: params.generatedAt,
    capturedAt: params.capturedAt,
    evalSeedSource: params.evalSeedSource,
    includeLiveOutput: params.includeLiveOutput,
  });

  return runAuthorEvalJobPayload({
    payload,
    store,
    verifier: params.verifier,
  });
}
