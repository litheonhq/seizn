import { canonicalize, canonicalJson, type JsonValue } from './canonical';
import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
  type AuthorEvalCase,
  type AuthorEvalCaseKind,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from './types';
import type { AuthorEvalJobPayload } from './contract';

export interface KnotInputBundle {
  characterRegistry?: {
    characters?: unknown[];
    supporting_cast?: unknown[];
  };
  worldRuleRegistry?: {
    rules?: unknown[];
  };
  relationshipMatrix?: {
    relationships?: unknown[];
  };
  timelineEventLedger?: {
    events?: unknown[];
  };
  evalSeed?: {
    cases?: unknown[];
  };
}

export function knotInputBundleToAuthorRecords(bundle: KnotInputBundle): AuthorMemoryRecord[] {
  return [
    ...(bundle.characterRegistry?.characters ?? []).map((item, index) =>
      knotCharacterToRecord(item, index)
    ),
    ...(bundle.characterRegistry?.supporting_cast ?? []).map((item, index) =>
      knotCharacterToRecord(item, index)
    ),
    ...(bundle.worldRuleRegistry?.rules ?? []).map((item, index) =>
      knotWorldRuleToRecord(item, index)
    ),
    ...(bundle.relationshipMatrix?.relationships ?? []).map((item, index) =>
      knotRelationshipToRecord(item, index)
    ),
    ...(bundle.timelineEventLedger?.events ?? []).map((item, index) =>
      knotTimelineEventToRecord(item, index)
    ),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export function knotEvalSeedToAuthorEvalCases(seed: { cases?: unknown[] }): AuthorEvalCase[] {
  return (seed.cases ?? [])
    .map((item, index) => knotEvalSeedCaseToAuthorEvalCase(item, index))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function knotInputBundleToAuthorEvalJobPayload(params: {
  projectId: string;
  bundle: KnotInputBundle;
  runId?: string;
  mode?: AuthorEvalJobPayload['mode'];
  generatedAt?: string;
  capturedAt?: string;
}): AuthorEvalJobPayload {
  const testCases = knotEvalSeedToAuthorEvalCases(params.bundle.evalSeed ?? {});

  return {
    schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
    projectId: params.projectId,
    runId: params.runId,
    mode: params.mode ?? 'replay',
    generatedAt: params.generatedAt,
    capturedAt: params.capturedAt,
    records: knotInputBundleToAuthorRecords(params.bundle),
    cases: testCases.map((testCase) => ({
      testCase,
      request: createKnotAuthorEvalRequest(testCase),
    })),
  };
}

export function createKnotAuthorEvalRequest(testCase: AuthorEvalCase): AuthorSideEffectRequest {
  return {
    kind: 'llm',
    provider: 'author-memory-v3',
    operation: 'answer-knot-author-eval-case',
    input: {
      caseId: testCase.id,
      prompt: testCase.prompt,
      expected: canonicalize(testCase.expected),
    },
    params: {
      temperature: 0,
    },
  };
}

function knotCharacterToRecord(value: unknown, index: number): AuthorMemoryRecord {
  const item = asRecord(value);
  const id = readString(item, 'id') ?? `knot.character.${index}`;
  const name = readString(item, 'name');
  const status = toAuthorStatus(readString(item, 'review_status') ?? readString(item, 'status'));
  const sourceId = readSourceId(item.source_provenance) ?? readString(item, 'source');

  return {
    id,
    kind: 'person',
    status,
    content: compactText([
      name,
      readString(item, 'story_role'),
      readString(item, 'current_status'),
      stringifyField(item.basic_info),
      stringifyField(item.voice),
      stringifyField(item.knowledge_state),
    ]),
    source: sourceId ? { sourceId } : undefined,
    entityIds: [id],
    metadata: metadataFrom({
      graphEntityType: 'person',
      scope: canonicalize(item.scope ?? null),
      tags: canonicalize(item.tags ?? []),
      raw: canonicalize(item),
    }),
  };
}

function knotWorldRuleToRecord(value: unknown, index: number): AuthorMemoryRecord {
  const item = asRecord(value);
  const id = readString(item, 'id') ?? `knot.world_rule.${index}`;
  const status = toAuthorStatus(readString(item, 'status'));

  return {
    id,
    kind: 'world_rule',
    status,
    content: compactText([
      readString(item, 'name'),
      readString(item, 'description'),
      stringifyField(item.details),
      readString(item, 'scope_notes'),
    ]),
    validAt: readString(item, 'valid_at') ?? readString(item, 'validAt'),
    invalidAt: readNullableString(item, 'invalid_at') ?? readNullableString(item, 'invalidAt'),
    source: sourceFromString(readString(item, 'source')),
    confidence: toConfidence(item.confidence),
    entityIds: [id],
    metadata: metadataFrom({
      category: readString(item, 'category') ?? 'custom',
      scope: readString(item, 'scope') ?? 'global',
      tags: canonicalize(item.tags ?? []),
      raw: canonicalize(item),
    }),
  };
}

function knotRelationshipToRecord(value: unknown, index: number): AuthorMemoryRecord {
  const item = asRecord(value);
  const id = readString(item, 'id') ?? `knot.relationship.${index}`;
  const from = readString(item, 'from');
  const to = readString(item, 'to');

  return {
    id,
    kind: 'relationship',
    status: toAuthorStatus(readString(item, 'status')),
    content: compactText([
      readString(item, 'relationship_type'),
      stringifyField(item.current_state),
      stringifyField(item.events),
      readString(item, 'narrative_function'),
    ]),
    validAt: readString(item, 'valid_at') ?? readString(item, 'validAt'),
    invalidAt: readNullableString(item, 'invalid_at') ?? readNullableString(item, 'invalidAt'),
    source: sourceFromString(readString(item, 'source')),
    entityIds: [from, to].filter((item): item is string => Boolean(item)),
    metadata: metadataFrom({
      scope: readString(item, 'scope') ?? 'short1',
      relationshipType: readString(item, 'relationship_type') ?? 'custom',
      tags: canonicalize(item.tags ?? []),
      raw: canonicalize(item),
    }),
  };
}

function knotTimelineEventToRecord(value: unknown, index: number): AuthorMemoryRecord {
  const item = asRecord(value);
  const id = readString(item, 'id') ?? `knot.event.${index}`;
  const who = readStringArray(item, 'who');

  return {
    id,
    kind: 'event',
    status: toAuthorStatus(readString(item, 'status')),
    content: compactText([
      readString(item, 'day'),
      readString(item, 'date'),
      readString(item, 'scene_id'),
      readString(item, 'where'),
      readString(item, 'what'),
      stringifyField(item.knowledge_partition),
    ]),
    validAt: readString(item, 'valid_at') ?? readString(item, 'day') ?? readString(item, 'date'),
    invalidAt: readNullableString(item, 'invalid_at') ?? readNullableString(item, 'invalidAt'),
    entityIds: who,
    metadata: metadataFrom({
      day: readString(item, 'day') ?? null,
      date: readString(item, 'date') ?? null,
      sceneId: readString(item, 'scene_id') ?? null,
      tags: canonicalize(item.tags ?? []),
      raw: canonicalize(item),
    }),
  };
}

function knotEvalSeedCaseToAuthorEvalCase(value: unknown, index: number): AuthorEvalCase {
  const item = asRecord(value);
  const id = readString(item, 'case_id') ?? `knot.eval.${index}`;
  const category = readString(item, 'category');
  const expectedAnswer = readString(item, 'expected_answer') ?? readString(item, 'expected_behavior');
  const antiPattern = readString(item, 'expected_anti_pattern');

  return {
    schemaVersion: KNOT_AUTHOR_EVAL_V1_SCHEMA_VERSION,
    id,
    kind: toEvalCaseKind(category),
    prompt: readString(item, 'question') ?? id,
    expected: {
      mustInclude: expectedAnswer ? [expectedAnswer] : undefined,
      mustExclude: antiPattern ? [antiPattern] : undefined,
    },
    tags: [
      ...(readStringArray(item, 'tags') ?? []),
      category ? `category:${category}` : undefined,
    ].filter((item): item is string => Boolean(item)),
    metadata: metadataFrom({
      source: 'docs/knot-input/knot_author_eval_seed_v1.json',
      scoring: readString(item, 'scoring') ?? null,
      expectedEvidence: canonicalize(item.expected_evidence ?? []),
      raw: canonicalize(item),
    }),
  };
}

function toEvalCaseKind(category: string | undefined): AuthorEvalCaseKind {
  switch (category) {
    case 'author_only_leak':
    case 'forbidden_in_scope':
    case 'retired_setting_exclusion':
      return 'invalidated_fact_exclusion';
    case 'relationship_explanation':
      return 'relationship_continuity';
    case 'character_voice_consistency':
    case 'character_simulation':
      return 'persona_consistency';
    case 'timeline_consistency':
    case 'character_knowledge':
    case 'scope_isolation':
    case 'moon_phase':
    case 'transcendent_count':
    case 'contradiction_detection':
    default:
      return 'canon_recall';
  }
}

function toAuthorStatus(status: string | undefined): AuthorMemoryRecord['status'] {
  switch (status) {
    case 'canon':
      return 'canon';
    case 'retired':
      return 'retired';
    case 'contradicted':
      return 'contradicted';
    case 'invalidated':
      return 'invalidated';
    case 'rejected':
      return 'rejected';
    case 'past_only':
      return 'past_only';
    case 'candidate':
    case 'tbd':
    default:
      return 'candidate';
  }
}

function toConfidence(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value === 'high') {
    return 0.9;
  }

  if (value === 'medium') {
    return 0.6;
  }

  if (value === 'low') {
    return 0.3;
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNullableString(
  object: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (object[key] === null) {
    return null;
  }

  return readString(object, key);
}

function readStringArray(object: Record<string, unknown>, key: string): string[] {
  const value = object[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readSourceId(value: unknown): string | undefined {
  const source = asRecord(value);
  const primary = readString(source, 'primary');
  if (primary) {
    return primary;
  }

  const secondary = source.secondary;
  if (Array.isArray(secondary)) {
    return secondary.find((item): item is string => typeof item === 'string');
  }

  return undefined;
}

function sourceFromString(sourceId: string | undefined): AuthorMemoryRecord['source'] {
  return sourceId ? { sourceId } : undefined;
}

function metadataFrom(value: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
  );
}

function stringifyField(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return canonicalJson(value);
}

function compactText(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n');
}
