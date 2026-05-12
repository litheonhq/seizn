// Author Coach analyze pipeline.
//
// One call yields four findings sections:
//   1. local anti-cliche scan (auditText, no network)
//   2. story-layer presence map (LLM)
//   3. character arc audit (LLM)
//   4. critic notes (LLM)
//
// Sections 2-4 ship in a single batched LLM call backed by a JSON schema so
// the wall-clock cost is one round-trip instead of three. Result is cached by
// content hash in author_audit_log; cache hits return in < 100ms.

import { createHash } from 'node:crypto';

import {
  CRITIC_PERSONAS,
  PRESSFIELD_ANCHORS,
  SACRED_FLAW_ENGINE,
  STORY_LAYERS,
  STORY_LAYER_IDS,
  auditText,
  type AntiClicheFinding,
} from '@/lib/author/frameworks';
import {
  generateAuthorLlm,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
} from '@/lib/author/llm';
import type { AuthorAuditLogEntry, AuthorAuditLogStore } from '@/lib/author/audit/types';
import { createAuthorAuditLogEntry } from '@/lib/author/audit/logger';

import {
  COACH_LLM_SCHEMA,
  type CoachAnalysis,
  type CoachLlmResponse,
} from './schema';

const COACH_CACHE_TTL_DAYS = 7;
const COACH_LLM_MAX_TOKENS = 2400;
const COACH_LLM_TEMPERATURE = 0.2;

export interface AnalyzeCoachInput {
  userId: string;
  projectId: string;
  text: string;
}

export interface AnalyzeCoachDeps {
  generate?: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<CoachLlmResponse>>;
  auditStore?: AuthorAuditLogStore;
  now?: () => Date;
}

export function hashCoachInput(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

export function emptyCoachAnalysis(hash: string): CoachAnalysis {
  return {
    hash,
    storyLayers: STORY_LAYER_IDS.map((layer) => ({
      layer,
      present: false,
      evidence: '',
    })),
    characterArcs: [],
    criticNotes: [],
    antiCliche: [],
    latencyMs: 0,
    cached: false,
  };
}

export async function analyzeCoachInput(
  input: AnalyzeCoachInput,
  deps: AnalyzeCoachDeps = {}
): Promise<CoachAnalysis> {
  const text = input.text.trim();
  if (!text) {
    return emptyCoachAnalysis(hashCoachInput(''));
  }

  const hash = hashCoachInput(text);
  const localCliches = auditText(text);

  if (deps.auditStore) {
    const cached = await findCachedAnalysis(deps.auditStore, {
      userId: input.userId,
      projectId: input.projectId,
      hash,
      now: deps.now,
    });
    if (cached) {
      return {
        ...cached,
        antiCliche: mergeAntiCliche(localCliches, cached.antiCliche),
        cached: true,
      };
    }
  }

  const start = (deps.now?.() ?? new Date()).getTime();
  const generate = deps.generate ?? (generateAuthorLlm as unknown as NonNullable<AnalyzeCoachDeps['generate']>);
  const response = await generate({
    userId: input.userId,
    projectId: input.projectId,
    system: buildCoachSystem(),
    prompt: buildCoachPrompt(text),
    responseFormat: 'json',
    jsonSchema: COACH_LLM_SCHEMA,
    maxTokens: COACH_LLM_MAX_TOKENS,
    temperature: COACH_LLM_TEMPERATURE,
    effort: 'medium',
  });

  const end = (deps.now?.() ?? new Date()).getTime();
  const llm = response.json ?? { storyLayers: [], characterArcs: [], criticNotes: [] };

  const analysis: CoachAnalysis = {
    hash,
    storyLayers: ensureAllLayers(llm.storyLayers ?? []),
    characterArcs: llm.characterArcs ?? [],
    criticNotes: llm.criticNotes ?? [],
    antiCliche: localCliches,
    latencyMs: end - start,
    cached: false,
  };

  if (deps.auditStore) {
    const entry = createAuthorAuditLogEntry({
      projectId: input.projectId,
      userId: input.userId,
      eventType: 'coach.analysis',
      payload: {
        hash,
        analysis: serializableAnalysis(analysis),
        latencyMs: analysis.latencyMs,
      },
      llmMeta: {
        provider: response.provider,
        model: response.model,
        tokens_in: response.usage?.tokensIn,
        tokens_out: response.usage?.tokensOut,
        request_id: response.requestId,
        operation: 'coach.analyze',
      },
    });
    await deps.auditStore.log(entry);
  }

  return analysis;
}

function serializableAnalysis(analysis: CoachAnalysis): Omit<CoachAnalysis, 'cached'> {
  const { cached: _cached, ...rest } = analysis;
  return rest;
}

function mergeAntiCliche(local: AntiClicheFinding[], cached: AntiClicheFinding[]): AntiClicheFinding[] {
  const seen = new Set<string>();
  const out: AntiClicheFinding[] = [];
  for (const finding of [...local, ...cached]) {
    const key = `${finding.index}:${finding.match.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out.sort((a, b) => a.index - b.index);
}

function ensureAllLayers(items: Array<Partial<CoachLlmResponse['storyLayers'][number]>>): CoachAnalysis['storyLayers'] {
  const byLayer = new Map<string, CoachAnalysis['storyLayers'][number]>();
  for (const layer of STORY_LAYER_IDS) {
    byLayer.set(layer, { layer, present: false, evidence: '' });
  }
  for (const item of items) {
    if (!item || typeof item.layer !== 'string') continue;
    if (!byLayer.has(item.layer)) continue;
    byLayer.set(item.layer, {
      layer: item.layer as CoachAnalysis['storyLayers'][number]['layer'],
      present: item.present === true,
      evidence: typeof item.evidence === 'string' ? item.evidence : '',
    });
  }
  return STORY_LAYER_IDS.map((layer) => byLayer.get(layer)!);
}

interface CacheLookupInput {
  userId: string;
  projectId: string;
  hash: string;
  now?: () => Date;
}

async function findCachedAnalysis(
  store: AuthorAuditLogStore,
  input: CacheLookupInput
): Promise<CoachAnalysis | null> {
  const results = await store.search({
    userId: input.userId,
    projectId: input.projectId,
    eventTypes: ['coach.analysis'],
    limit: 20,
  });
  const cutoff = new Date((input.now?.() ?? new Date()).getTime() - COACH_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  for (const entry of results) {
    if (!entryMatchesHash(entry, input.hash)) continue;
    if (new Date(entry.createdAt) < cutoff) continue;
    const payload = entry.payload as { analysis?: Omit<CoachAnalysis, 'cached'> } | null;
    if (!payload?.analysis) continue;
    return { ...payload.analysis, cached: false };
  }
  return null;
}

function entryMatchesHash(entry: AuthorAuditLogEntry, hash: string): boolean {
  const payload = entry.payload as { hash?: unknown } | null;
  return Boolean(payload && typeof payload === 'object' && 'hash' in payload && payload.hash === hash);
}

function buildCoachSystem(): string {
  const layers = STORY_LAYERS
    .map((layer) => `- ${layer.id}: ${layer.name} — ${layer.description}`)
    .join('\n');
  const sacred = SACRED_FLAW_ENGINE
    .map((entry) => `- ${entry.level} (${entry.domain}): ${entry.what}`)
    .join('\n');
  const pressfield = PRESSFIELD_ANCHORS
    .map((anchor) => `- ${anchor.id}: ${anchor.definition}`)
    .join('\n');
  const mandatoryCritics = CRITIC_PERSONAS
    .filter((critic) => critic.mandatory)
    .map((critic) => `- ${critic.id} (${critic.name}): ${critic.focus}`)
    .join('\n');

  return [
    'You are the Seizn Author Coach. Audit a single scene against four framework lenses.',
    '',
    'Story Layers (Will Storr / Pressfield):',
    layers,
    '',
    'Sacred Flaw engine (Storr):',
    sacred,
    '',
    'Pressfield anchors:',
    pressfield,
    '',
    'Mandatory critic personas:',
    mandatoryCritics,
    '',
    'Rules:',
    '1. Be specific. Reference exact lines in the scene, never general gestures.',
    '2. For storyLayers, every layer id must appear exactly once with present=true|false.',
    '3. For characterArcs, only include characters who actually appear or are clearly implied.',
    '4. For criticNotes, return ONLY the mandatory critics. Each suggestions array: 2-5 items.',
    '5. Honor the JSON schema strictly. Do not include prose outside the JSON body.',
  ].join('\n');
}

function buildCoachPrompt(text: string): string {
  return [
    'Analyze the following scene. Return JSON only.',
    '',
    '---',
    text,
    '---',
  ].join('\n');
}
