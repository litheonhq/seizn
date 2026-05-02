import type { JsonValue } from './canonical';
import { runAuthorEvalJob, type RunAuthorEvalJobOutput } from './job';
import type { AuthorMemoryV3Store } from './store';
import type { AuthorEvalVerifier } from './verifier';
import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  type AuthorEvalCase,
  type AuthorEvalCaseKind,
  type AuthorMemoryKind,
  type AuthorMemoryRecord,
  type AuthorReplayMode,
  type AuthorSideEffectKind,
  type AuthorSideEffectRequest,
} from './types';

const AUTHOR_CANON_STATUSES = new Set<AuthorMemoryRecord['status']>([
  'candidate',
  'canon',
  'rejected',
  'retired',
  'contradicted',
  'invalidated',
  'past_only',
]);

const AUTHOR_MEMORY_KINDS = new Set<AuthorMemoryKind>([
  'person',
  'relationship',
  'world_rule',
  'event',
  'location',
  'scene',
  'document_chunk',
  'author_note',
]);

const AUTHOR_EVAL_CASE_KINDS = new Set<AuthorEvalCaseKind>([
  'canon_recall',
  'invalidated_fact_exclusion',
  'relationship_continuity',
  'persona_consistency',
  'scene_simulation',
]);

const AUTHOR_SIDE_EFFECT_KINDS = new Set<AuthorSideEffectKind>([
  'llm',
  'parser',
  'embedding',
  'reranker',
  'tool',
  'api',
]);

const AUTHOR_REPLAY_MODES = new Set<AuthorReplayMode>(['record', 'replay', 'off']);

export interface AuthorEvalJobPayloadCase {
  testCase: AuthorEvalCase;
  request: AuthorSideEffectRequest;
  liveOutput?: JsonValue;
}

export interface AuthorEvalJobPayload {
  schemaVersion: typeof AUTHOR_MEMORY_V3_SCHEMA_VERSION;
  projectId: string;
  runId?: string;
  mode: AuthorReplayMode;
  generatedAt?: string;
  capturedAt?: string;
  records: AuthorMemoryRecord[];
  cases: AuthorEvalJobPayloadCase[];
}

export class AuthorMemoryV3ContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid Author Memory v3 payload: ${issues.join('; ')}`);
    this.name = 'AuthorMemoryV3ContractError';
  }
}

export function parseAuthorEvalJobPayload(value: unknown): AuthorEvalJobPayload {
  const issues: string[] = [];
  const root = asObject(value, 'payload', issues);
  const schemaVersion = readString(root, 'schemaVersion', 'payload.schemaVersion', issues);
  const projectId = readString(root, 'projectId', 'payload.projectId', issues);
  const mode = readOptionalString(root, 'mode', 'payload.mode', issues) ?? 'record';
  const records = readArray(root, 'records', 'payload.records', issues)
    .map((record, index) => parseAuthorMemoryRecord(record, `payload.records[${index}]`, issues));
  const cases = readArray(root, 'cases', 'payload.cases', issues)
    .map((item, index) => parseAuthorEvalJobPayloadCase(item, `payload.cases[${index}]`, issues));

  if (schemaVersion !== AUTHOR_MEMORY_V3_SCHEMA_VERSION) {
    issues.push(`payload.schemaVersion must be ${AUTHOR_MEMORY_V3_SCHEMA_VERSION}`);
  }

  if (!AUTHOR_REPLAY_MODES.has(mode as AuthorReplayMode)) {
    issues.push('payload.mode must be record, replay, or off');
  }

  if (issues.length > 0) {
    throw new AuthorMemoryV3ContractError(issues);
  }

  return {
    schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
    projectId,
    runId: readOptionalString(root, 'runId', 'payload.runId', issues),
    mode: mode as AuthorReplayMode,
    generatedAt: readOptionalString(root, 'generatedAt', 'payload.generatedAt', issues),
    capturedAt: readOptionalString(root, 'capturedAt', 'payload.capturedAt', issues),
    records,
    cases,
  };
}

export async function runAuthorEvalJobPayload(params: {
  payload: AuthorEvalJobPayload;
  store: AuthorMemoryV3Store;
  verifier?: AuthorEvalVerifier;
}): Promise<RunAuthorEvalJobOutput> {
  return runAuthorEvalJob({
    projectId: params.payload.projectId,
    runId: params.payload.runId,
    records: params.payload.records,
    cases: params.payload.cases.map((jobCase) => ({
      testCase: jobCase.testCase,
      request: jobCase.request,
    })),
    store: params.store,
    mode: params.payload.mode,
    generatedAt: params.payload.generatedAt,
    capturedAt: params.payload.capturedAt,
    verifier: params.verifier,
    live: ({ caseIndex, testCase }) => {
      const output = params.payload.cases[caseIndex].liveOutput;
      if (output === undefined) {
        throw new Error(`Author Memory v3 payload case ${testCase.id} is missing liveOutput`);
      }

      return output;
    },
  });
}

function parseAuthorEvalJobPayloadCase(
  value: unknown,
  path: string,
  issues: string[]
): AuthorEvalJobPayloadCase {
  const object = asObject(value, path, issues);
  const liveOutput = object.liveOutput === undefined
    ? undefined
    : parseJsonValue(object.liveOutput, `${path}.liveOutput`, issues);

  return {
    testCase: parseAuthorEvalCase(object.testCase, `${path}.testCase`, issues),
    request: parseAuthorSideEffectRequest(object.request, `${path}.request`, issues),
    liveOutput,
  };
}

function parseAuthorMemoryRecord(
  value: unknown,
  path: string,
  issues: string[]
): AuthorMemoryRecord {
  const object = asObject(value, path, issues);
  const kind = readString(object, 'kind', `${path}.kind`, issues);
  const status = readString(object, 'status', `${path}.status`, issues);
  const sourceValue = object.source === undefined
    ? undefined
    : parseSourceSpan(object.source, `${path}.source`, issues);
  const confidence = readOptionalNumber(object, 'confidence', `${path}.confidence`, issues);

  if (!AUTHOR_MEMORY_KINDS.has(kind as AuthorMemoryKind)) {
    issues.push(`${path}.kind is not supported`);
  }

  if (!AUTHOR_CANON_STATUSES.has(status as AuthorMemoryRecord['status'])) {
    issues.push(`${path}.status is not supported`);
  }

  return {
    id: readString(object, 'id', `${path}.id`, issues),
    kind: kind as AuthorMemoryKind,
    status: status as AuthorMemoryRecord['status'],
    content: readString(object, 'content', `${path}.content`, issues),
    validAt: readOptionalString(object, 'validAt', `${path}.validAt`, issues),
    invalidAt: readOptionalNullableString(object, 'invalidAt', `${path}.invalidAt`, issues),
    source: sourceValue,
    supersedesId: readOptionalString(object, 'supersedesId', `${path}.supersedesId`, issues),
    invalidatesId: readOptionalString(object, 'invalidatesId', `${path}.invalidatesId`, issues),
    confidence,
    entityIds: readOptionalStringArray(object, 'entityIds', `${path}.entityIds`, issues),
    metadata: readOptionalJsonObject(object, 'metadata', `${path}.metadata`, issues),
  };
}

function parseAuthorEvalCase(value: unknown, path: string, issues: string[]): AuthorEvalCase {
  const object = asObject(value, path, issues);
  const schemaVersion = readString(object, 'schemaVersion', `${path}.schemaVersion`, issues);
  const kind = readString(object, 'kind', `${path}.kind`, issues);
  const expected = asObject(object.expected, `${path}.expected`, issues);

  if (schemaVersion !== KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION) {
    issues.push(`${path}.schemaVersion must be ${KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION}`);
  }

  if (!AUTHOR_EVAL_CASE_KINDS.has(kind as AuthorEvalCaseKind)) {
    issues.push(`${path}.kind is not supported`);
  }

  return {
    schemaVersion: KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
    id: readString(object, 'id', `${path}.id`, issues),
    kind: kind as AuthorEvalCaseKind,
    prompt: readString(object, 'prompt', `${path}.prompt`, issues),
    expected: {
      mustInclude: readOptionalStringArray(expected, 'mustInclude', `${path}.expected.mustInclude`, issues),
      mustExclude: readOptionalStringArray(expected, 'mustExclude', `${path}.expected.mustExclude`, issues),
      allowedUnknowns: readOptionalStringArray(expected, 'allowedUnknowns', `${path}.expected.allowedUnknowns`, issues),
    },
    tags: readOptionalStringArray(object, 'tags', `${path}.tags`, issues),
    metadata: readOptionalJsonObject(object, 'metadata', `${path}.metadata`, issues),
  };
}

function parseAuthorSideEffectRequest(
  value: unknown,
  path: string,
  issues: string[]
): AuthorSideEffectRequest {
  const object = asObject(value, path, issues);
  const kind = readString(object, 'kind', `${path}.kind`, issues);

  if (!AUTHOR_SIDE_EFFECT_KINDS.has(kind as AuthorSideEffectKind)) {
    issues.push(`${path}.kind is not supported`);
  }

  return {
    kind: kind as AuthorSideEffectKind,
    provider: readString(object, 'provider', `${path}.provider`, issues),
    model: readOptionalString(object, 'model', `${path}.model`, issues),
    operation: readString(object, 'operation', `${path}.operation`, issues),
    input: parseJsonValue(object.input, `${path}.input`, issues),
    params: readOptionalJsonObject(object, 'params', `${path}.params`, issues),
    seed: readOptionalNumber(object, 'seed', `${path}.seed`, issues),
  };
}

function parseSourceSpan(value: unknown, path: string, issues: string[]): AuthorMemoryRecord['source'] {
  const object = asObject(value, path, issues);

  return {
    sourceId: readString(object, 'sourceId', `${path}.sourceId`, issues),
    start: readOptionalNumber(object, 'start', `${path}.start`, issues),
    end: readOptionalNumber(object, 'end', `${path}.end`, issues),
    quote: readOptionalString(object, 'quote', `${path}.quote`, issues),
  };
}

function asObject(value: unknown, path: string, issues: string[]): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  issues.push(`${path} must be an object`);
  return {};
}

function readString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): string {
  const value = object[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  issues.push(`${path} must be a non-empty string`);
  return '';
}

function readOptionalString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): string | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  issues.push(`${path} must be a non-empty string when provided`);
  return undefined;
}

function readOptionalNullableString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): string | null | undefined {
  if (object[key] === null) {
    return null;
  }

  return readOptionalString(object, key, path, issues);
}

function readOptionalNumber(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): number | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  issues.push(`${path} must be a finite number when provided`);
  return undefined;
}

function readArray(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): unknown[] {
  const value = object[key];
  if (Array.isArray(value)) {
    return value;
  }

  issues.push(`${path} must be an array`);
  return [];
}

function readOptionalStringArray(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): string[] | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [...value];
  }

  issues.push(`${path} must be an array of strings when provided`);
  return undefined;
}

function readOptionalJsonObject(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): Record<string, JsonValue> | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  const parsed = parseJsonValue(value, path, issues);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }

  issues.push(`${path} must be a JSON object when provided`);
  return undefined;
}

function parseJsonValue(value: unknown, path: string, issues: string[]): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }

    issues.push(`${path} must be a finite JSON number`);
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => parseJsonValue(item, `${path}[${index}]`, issues));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, parseJsonValue(item, `${path}.${key}`, issues)])
    );
  }

  issues.push(`${path} must be JSON-compatible`);
  return null;
}
