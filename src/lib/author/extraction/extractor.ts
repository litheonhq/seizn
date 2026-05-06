import characterRegistry from '../../../../docs/knot-input/character_registry.json';
import worldRuleRegistry from '../../../../docs/knot-input/world_rule_registry.json';
import type { AuthorJsonSchema, AuthorLlmRequest, AuthorLlmResponse } from '@/lib/author/llm';
import { generateAuthorLlm } from '@/lib/author/llm';
import characterSchema from './schemas/candidate-character.json';
import worldRuleSchema from './schemas/candidate-world-rule.json';
import eventSchema from './schemas/candidate-event.json';
import relationshipSchema from './schemas/candidate-relationship.json';
import voiceSampleSchema from './schemas/candidate-voice-sample.json';
import { buildBacklogPrompt, buildExtractionPrompt, AUTHOR_EXTRACTION_TASKS } from './prompt-catalog';
import { validateExtractedCandidates } from './validator';
import type {
  AuthorBacklogCandidate,
  AuthorBacklogCategory,
  AuthorBacklogInput,
  AuthorBacklogResult,
  AuthorExtractionCandidateType,
  AuthorExtractionInput,
  AuthorExtractionPromptTask,
  AuthorExtractionResult,
  ExtractedAuthorCandidate,
} from './types';

interface LlmCandidateResponse {
  candidates?: Array<{
    content?: string;
    confidence?: number;
    suggested_status?: string;
    tags?: string[];
    target_entity_id?: string;
  }>;
}

interface LlmBacklogResponse {
  candidates?: Array<{
    category?: string;
    content?: string;
    rationale?: string;
    tier?: number;
    scope?: string;
  }>;
}

interface ExtractAuthorCandidatesDeps {
  mode?: 'llm' | 'heuristic';
  generate?: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<LlmCandidateResponse>>;
}

interface GenerateBacklogDeps {
  mode?: 'llm' | 'heuristic';
  generate?: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<LlmBacklogResponse>>;
}

const SCHEMAS: Record<string, AuthorJsonSchema> = {
  character: characterSchema as AuthorJsonSchema,
  world_rule: worldRuleSchema as AuthorJsonSchema,
  event: eventSchema as AuthorJsonSchema,
  relationship: relationshipSchema as AuthorJsonSchema,
  voice_sample: voiceSampleSchema as AuthorJsonSchema,
};

const MAX_PROMPT_CHARS = 12000;
const BACKLOG_CATEGORIES: AuthorBacklogCategory[] = ['좋아하는 것', '싫어하는 것', '작은 보상', '작은 짜증'];
const BACKLOG_SCHEMA = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'content', 'rationale', 'tier', 'scope'],
        properties: {
          category: { type: 'string' },
          content: { type: 'string' },
          rationale: { type: 'string' },
          tier: { type: 'number' },
          scope: { type: 'string' },
        },
      },
    },
  },
} as AuthorJsonSchema;
const BACKLOG_FORBIDDEN_TERMS = ['author_only', 'Tier 2', '고양이 귀', '성인 마녀풍'];

export async function extractAuthorCandidates(
  input: AuthorExtractionInput,
  deps: ExtractAuthorCandidatesDeps = {}
): Promise<AuthorExtractionResult> {
  const text = input.text.trim();
  if (!text) {
    return emptyResult(defaultMode(deps.mode));
  }

  const mode = defaultMode(deps.mode);
  const rawCandidates = mode === 'llm'
    ? await extractWithLlm(input, text, deps.generate ?? generateAuthorLlm)
    : heuristicExtract(input, text);

  const validated = validateExtractedCandidates({
    candidates: rawCandidates,
    existingCandidates: input.existingCandidates,
    scope: 'short1',
  });

  return {
    candidates: validated.accepted,
    rejected: validated.rejected,
    metrics: {
      mode,
      raw_candidate_count: rawCandidates.length,
      accepted_count: validated.accepted.length,
      rejected_count: validated.rejected.length,
      prompt_count: mode === 'llm' ? AUTHOR_EXTRACTION_TASKS.length : 0,
    },
  };
}

export async function generateBacklogForCharacter(
  input: AuthorBacklogInput,
  deps: GenerateBacklogDeps = {}
): Promise<AuthorBacklogResult> {
  const mode = defaultMode(deps.mode);
  const categories = input.categories?.length ? input.categories : BACKLOG_CATEGORIES;
  const itemsPerCategory = Math.max(5, Math.min(7, input.itemsPerCategory ?? 5));
  const rawCandidates = mode === 'llm'
    ? await generateBacklogWithLlm(input, categories, itemsPerCategory, deps.generate ?? generateAuthorLlm)
    : generateBacklogHeuristic(input, categories, itemsPerCategory);
  const validated = validateBacklogCandidates(input, rawCandidates);

  return {
    characterId: input.character.id,
    characterName: input.character.name,
    candidates: validated.accepted,
    rejected: validated.rejected,
    exportMarkdown: formatBacklogExportMarkdown(input.character.name, validated.accepted),
    metrics: {
      mode,
      categories,
      requested_per_category: itemsPerCategory,
      accepted_count: validated.accepted.length,
      rejected_count: validated.rejected.length,
    },
  };
}

async function generateBacklogWithLlm(
  input: AuthorBacklogInput,
  categories: AuthorBacklogCategory[],
  itemsPerCategory: number,
  generate: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<LlmBacklogResponse>>
): Promise<AuthorBacklogCandidate[]> {
  const response = await generate({
    userId: input.userId,
    projectId: input.projectId,
    prompt: buildBacklogPrompt({
      character: input.character,
      categories,
      itemsPerCategory,
      existingEntries: input.existingEntries ?? [],
      principles: input.principles,
      forbiddenTerms: BACKLOG_FORBIDDEN_TERMS,
    }),
    responseFormat: 'json',
    jsonSchema: BACKLOG_SCHEMA,
    maxTokens: 2400,
    temperature: 0.2,
  });

  return (response.json?.candidates ?? [])
    .map((candidate) => normalizeBacklogCandidate(candidate))
    .filter((candidate): candidate is AuthorBacklogCandidate => candidate !== null);
}

function generateBacklogHeuristic(
  input: AuthorBacklogInput,
  categories: AuthorBacklogCategory[],
  itemsPerCategory: number
): AuthorBacklogCandidate[] {
  const name = input.character.name;
  const trait = compactBacklogText(input.character.summary, input.character.archetype) || '현재 장면의 압력을 조심스럽게 읽는 태도';
  const voice = compactBacklogText(input.character.voice) || '말수와 반응 속도';
  const persona = compactBacklogText(input.character.persona) || '관계 안에서 반복되는 작은 선택';
  const base = {
    '좋아하는 것': [
      `${name}은 장면이 정돈될 때 말보다 먼저 주변의 빈틈을 확인한다.`,
      `${name}은 상대가 서두르지 않고 기다려 주면 경계심을 조금 낮춘다.`,
      `${name}은 ${trait}이 드러나는 조용한 역할 분담을 선호한다.`,
      `${name}은 ${voice}를 무너뜨리지 않아도 되는 짧은 확인을 좋아한다.`,
      `${name}은 ${persona}가 존중되는 대화를 오래 기억한다.`,
      `${name}은 자신이 먼저 설명하지 않아도 상황이 정리되는 순간을 편하게 느낀다.`,
      `${name}은 작은 약속이 실제 행동으로 지켜질 때 반응이 부드러워진다.`,
    ],
    '싫어하는 것': [
      `${name}은 모르는 사실을 안다고 단정하는 말을 불편해한다.`,
      `${name}은 감정을 크게 몰아붙이는 장면에서 한 박자 물러난다.`,
      `${name}은 ${trait}을 농담거리로 소비하는 반응을 피한다.`,
      `${name}은 ${voice}를 억지로 바꾸게 만드는 질문에 답을 줄인다.`,
      `${name}은 ${persona}를 무시한 채 결론만 재촉하는 흐름을 싫어한다.`,
      `${name}은 사적인 관찰을 공개적으로 확인받는 상황을 꺼린다.`,
      `${name}은 아직 검증되지 않은 단서를 확정처럼 다루는 태도를 경계한다.`,
    ],
    '작은 보상': [
      `${name}에게는 말없이 자리나 시간을 내주는 행동이 작은 보상으로 작동한다.`,
      `${name}은 자신이 놓친 부분을 조용히 보완받으면 다음 장면에서 먼저 움직인다.`,
      `${name}은 ${trait}을 인정받을 때 과장 없이 짧게 반응한다.`,
      `${name}은 ${voice}를 유지한 채 동료가 의도를 알아주면 긴장을 덜어낸다.`,
      `${name}은 ${persona}와 맞는 소소한 배려를 받으면 기억해 둔다.`,
      `${name}은 맡은 일이 깔끔히 끝났다는 확인에 안정감을 얻는다.`,
      `${name}은 불필요한 설명 없이 신뢰받을 때 행동 속도가 빨라진다.`,
    ],
    '작은 짜증': [
      `${name}은 같은 질문을 감정 확인용으로 반복하면 대답이 짧아진다.`,
      `${name}은 정리된 물건이나 역할을 이유 없이 흐트러뜨리면 시선을 피한다.`,
      `${name}은 ${trait}을 과하게 해석하는 말에 즉시 거리를 둔다.`,
      `${name}은 ${voice}를 흉내 내는 반응을 장난으로 받아들이지 않는다.`,
      `${name}은 ${persona}와 맞지 않는 선의가 반복되면 침묵 시간이 길어진다.`,
      `${name}은 아직 말하지 않은 결론을 대신 정리당하면 표정이 굳는다.`,
      `${name}은 사소한 실수를 크게 확대하는 분위기에서 먼저 대화를 끊는다.`,
    ],
  } satisfies Record<AuthorBacklogCategory, string[]>;

  return categories.flatMap((category) =>
    base[category].slice(0, itemsPerCategory).map((content) => ({
      category,
      content,
      rationale: `${name}의 현재 요약, 말투, 페르소나를 행동 단서로 변환한 후보입니다.`,
      tier: 1 as const,
      scope: 'short1' as const,
    }))
  );
}

async function extractWithLlm(
  input: AuthorExtractionInput,
  text: string,
  generate: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<LlmCandidateResponse>>
): Promise<ExtractedAuthorCandidate[]> {
  const promptText = text.slice(0, MAX_PROMPT_CHARS);
  const responses = await Promise.all(AUTHOR_EXTRACTION_TASKS.map(async (task) => {
    const response = await generate({
      userId: input.userId,
      projectId: input.projectId,
      prompt: buildExtractionPrompt({
        task,
        sourceRole: input.sourceRole,
        fileName: input.fileName,
        text: promptText,
      }),
      responseFormat: 'json',
      jsonSchema: SCHEMAS[task.type],
      maxTokens: 1200,
      temperature: 0,
    });
    return mapLlmResponse(input, task, response);
  }));

  return responses.flat();
}

function mapLlmResponse(
  input: AuthorExtractionInput,
  task: AuthorExtractionPromptTask,
  response: AuthorLlmResponse<LlmCandidateResponse>
): ExtractedAuthorCandidate[] {
  const candidates = response.json?.candidates ?? [];
  return candidates
    .filter((candidate) => typeof candidate.content === 'string' && candidate.content.trim().length > 0)
    .map((candidate, index) => buildCandidate({
      input,
      type: task.type,
      content: candidate.content ?? '',
      confidence: candidate.confidence ?? 0.72,
      tags: candidate.tags ?? ['short1', 'tier:1'],
      targetEntityId: candidate.target_entity_id,
      index,
    }));
}

function heuristicExtract(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  const candidates: ExtractedAuthorCandidate[] = [];
  candidates.push(...extractCharacters(input, text));
  candidates.push(...extractWorldRules(input, text));
  candidates.push(...extractEvents(input, text));
  candidates.push(...extractRelationships(input, text));
  candidates.push(...extractVoiceSamples(input, text));

  if (candidates.length === 0 && input.sourceRole !== 'visual') {
    candidates.push(buildCandidate({
      input,
      type: 'fact',
      content: firstMeaningfulLine(text),
      confidence: 0.58,
      tags: ['short1', 'tier:1', `source:${input.sourceRole}`],
      index: 0,
    }));
  }

  return candidates;
}

function extractCharacters(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  const characters = Array.isArray(characterRegistry.characters) ? characterRegistry.characters : [];
  const registryMatches = characters
    .filter((item) => typeof item.name === 'string' && text.includes(item.name))
    .slice(0, 8)
    .map((item, index) => buildCandidate({
      input,
      type: 'character',
      content: `${item.name}: ${String(item.archetype ?? item.current_status ?? 'character evidence')}`,
      confidence: 0.82,
      tags: ['short1', 'tier:1', 'character'],
      targetEntityId: String(item.id ?? ''),
      index,
    }));
  const registryNames = new Set(characters
    .map((item) => typeof item.name === 'string' ? item.name : '')
    .filter(Boolean));
  const headingMatches = extractCharacterNamesFromHeadings(text, registryNames)
    .slice(0, 12)
    .map((name, index) => buildCandidate({
      input,
      type: 'character',
      content: `${name}: character evidence from ${input.fileName}`,
      confidence: 0.72,
      tags: ['short1', 'tier:1', 'character', headingSupportTag(input.fileName)],
      index: registryMatches.length + index,
    }));

  return [...registryMatches, ...headingMatches];
}

function extractWorldRules(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  const hasRuleCue = /canon|rule|forbidden|scope|tier|금|규칙|법|캐논|금지/.test(text);
  if (!hasRuleCue && input.sourceRole !== 'canon') return [];
  const rules = Array.isArray(worldRuleRegistry.rules) ? worldRuleRegistry.rules : [];
  const matchedRule = rules.find((rule) => typeof rule.name === 'string' && text.includes(rule.name));
  return [buildCandidate({
    input,
    type: 'world_rule',
    content: matchedRule
      ? `${matchedRule.name}: ${String(matchedRule.description ?? matchedRule.category ?? 'world rule')}`
      : firstMeaningfulLine(text),
    confidence: matchedRule ? 0.84 : 0.62,
    tags: ['short1', 'tier:1', 'world_rule'],
    targetEntityId: matchedRule ? String(matchedRule.id ?? '') : undefined,
    index: 0,
  })];
}

function extractEvents(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  const matches = [...text.matchAll(/\bD(\d{1,2})\b[^.\n]{0,160}/g)].slice(0, 8);
  return matches.map((match, index) => buildCandidate({
    input,
    type: 'event',
    content: match[0].trim(),
    confidence: 0.76,
    tags: ['short1', 'tier:1', `day:D${match[1]}`],
    index,
  }));
}

function extractRelationships(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  if (!/(↔|->|→|relationship|관계|신뢰|갈등|룸메)/.test(text)) return [];
  return [buildCandidate({
    input,
    type: 'relationship',
    content: firstMeaningfulLine(text),
    confidence: 0.68,
    tags: ['short1', 'tier:1', 'relationship'],
    index: 0,
  })];
}

function extractVoiceSamples(input: AuthorExtractionInput, text: string): ExtractedAuthorCandidate[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /["'“”‘’]|말투|voice|대사|표현|~/.test(line))
    .slice(0, 6);
  return lines.map((line, index) => buildCandidate({
    input,
    type: 'voice_sample',
    content: line,
    confidence: 0.7,
    tags: ['short1', 'tier:1', 'voice'],
    index,
  }));
}

function buildCandidate(input: {
  input: AuthorExtractionInput;
  type: AuthorExtractionCandidateType;
  content: string;
  confidence: number;
  tags: string[];
  targetEntityId?: string;
  index: number;
}): ExtractedAuthorCandidate {
  const source = sourceForContent(input.input, input.content);
  return {
    content: input.content,
    type: input.type,
    status: 'candidate',
    confidence: input.confidence,
    suggested_status: 'candidate',
    tags: input.tags.filter(Boolean),
    source,
    related_existing: [],
    ...(input.targetEntityId ? { target_entity_id: input.targetEntityId } : {}),
  };
}

function extractCharacterNamesFromHeadings(text: string, registryNames: Set<string>): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/^##\s+\d+\.\s+(.+)$/gm)) {
    const heading = stripMarkdown(match[1] ?? '');
    if (isNonCharacterHeading(heading)) continue;

    const parsed = namesFromCharacterHeading(heading);
    for (const name of parsed) {
      if (!name || registryNames.has(name)) continue;
      names.push(name);
    }
  }
  return uniqueStrings(names);
}

function namesFromCharacterHeading(heading: string): string[] {
  const [leftRaw, rightRaw = ''] = heading.split(/\s+[—-]\s+/, 2);
  const left = cleanCharacterName(leftRaw);
  const right = cleanCharacterName(rightRaw);
  const base = ['주인공', 'protagonist'].includes(left.toLowerCase()) && right ? right : left;
  return base
    .split(/[·,／/]/)
    .map(cleanCharacterName)
    .filter(Boolean);
}

function cleanCharacterName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\*\*/g, '')
    .split(/\s+/)[0]
    .trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/<!--.*?-->/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/#/g, '')
    .trim();
}

function isNonCharacterHeading(heading: string): boolean {
  return [
    '원칙',
    '매트릭스',
    '리마인더',
    '연결 문서',
    '참조 표',
    'Dataview',
    'Index',
  ].some((marker) => heading.includes(marker));
}

function headingSupportTag(fileName: string): string {
  return fileName.includes('supporting') ? 'supporting' : 'heading';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function validateBacklogCandidates(
  input: AuthorBacklogInput,
  candidates: AuthorBacklogCandidate[]
): {
  accepted: AuthorBacklogCandidate[];
  rejected: Array<{ candidate: AuthorBacklogCandidate; reasons: string[] }>;
} {
  const existing = new Set([
    ...(input.existingEntries ?? []),
    ...(input.existingCandidates ?? []).flatMap((candidate) => [
      candidate.content,
      stripBacklogCategoryPrefix(candidate.content),
    ]),
  ].map(normalizeBacklogText));
  const seen = new Set<string>();
  const accepted: AuthorBacklogCandidate[] = [];
  const rejected: Array<{ candidate: AuthorBacklogCandidate; reasons: string[] }> = [];

  for (const candidate of candidates) {
    const normalized = normalizeBacklogText(candidate.content);
    const reasons: string[] = [];
    if (!BACKLOG_CATEGORIES.includes(candidate.category)) reasons.push('invalid_category');
    if (!candidate.content.trim()) reasons.push('empty_content');
    if (!candidate.rationale.trim()) reasons.push('empty_rationale');
    if (candidate.tier !== 1) reasons.push('tier2_not_allowed');
    if (candidate.scope !== 'short1') reasons.push('invalid_scope');
    if (seen.has(normalized)) reasons.push('duplicate_in_generation');
    if (existing.has(normalized)) reasons.push('duplicate_existing_backlog');
    const forbidden = BACKLOG_FORBIDDEN_TERMS.find((term) =>
      term && candidate.content.toLowerCase().includes(term.toLowerCase())
    );
    if (forbidden) reasons.push(`forbidden_backlog_term:${forbidden}`);

    if (reasons.length > 0) {
      rejected.push({ candidate, reasons });
      continue;
    }
    seen.add(normalized);
    accepted.push(candidate);
  }

  return { accepted, rejected };
}

function normalizeBacklogCandidate(candidate: {
  category?: string;
  content?: string;
  rationale?: string;
  tier?: number;
  scope?: string;
}): AuthorBacklogCandidate | null {
  if (typeof candidate.content !== 'string' || candidate.content.trim().length === 0) return null;
  const category = BACKLOG_CATEGORIES.includes(candidate.category as AuthorBacklogCategory)
    ? candidate.category as AuthorBacklogCategory
    : BACKLOG_CATEGORIES[0];
  return {
    category,
    content: candidate.content.trim(),
    rationale: typeof candidate.rationale === 'string' && candidate.rationale.trim()
      ? candidate.rationale.trim()
      : 'Generated from supplied character bible.',
    tier: candidate.tier === 2 ? 2 : 1,
    scope: 'short1',
  };
}

function formatBacklogExportMarkdown(characterName: string, candidates: AuthorBacklogCandidate[]): string {
  const lines = [`### ${characterName} §X.6 backlog candidates`, ''];
  for (const category of BACKLOG_CATEGORIES) {
    const items = candidates.filter((candidate) => candidate.category === category);
    lines.push(`#### ${category}`);
    if (items.length === 0) {
      lines.push('- (none)');
    } else {
      for (const item of items) {
        lines.push(`- ${item.content} — ${item.rationale}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function compactBacklogText(...values: unknown[]): string {
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>)
          .flatMap((item) => Array.isArray(item) ? item : [item])
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 4)
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim();
}

function normalizeBacklogText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

function stripBacklogCategoryPrefix(value: string): string {
  return value.replace(/^[^-]+ - /, '').trim();
}

function sourceForContent(input: AuthorExtractionInput, content: string): ExtractedAuthorCandidate['source'] {
  const startChar = Math.max(0, input.text.indexOf(content.slice(0, Math.min(content.length, 40))));
  const prefix = startChar >= 0 ? input.text.slice(0, startChar) : '';
  const startLine = prefix.length > 0 ? prefix.split(/\r?\n/).length : 1;
  const lineCount = Math.max(1, content.split(/\r?\n/).length);
  return {
    document_id: input.importId,
    file_path: input.fileName,
    span: {
      start_line: startLine,
      end_line: startLine + lineCount - 1,
      start_char: Math.max(0, startChar),
      end_char: Math.max(0, startChar) + content.length,
    },
    excerpt: content.slice(0, 180),
  };
}

function firstMeaningfulLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('---') && !line.startsWith('#')) ?? text.slice(0, 180);
}

function defaultMode(mode?: 'llm' | 'heuristic'): 'llm' | 'heuristic' {
  if (mode) return mode;
  if (process.env.AUTHOR_EXTRACTION_MODE === 'llm') return 'llm';
  return process.env.NODE_ENV === 'production' ? 'llm' : 'heuristic';
}

function emptyResult(mode: 'llm' | 'heuristic'): AuthorExtractionResult {
  return {
    candidates: [],
    rejected: [],
    metrics: {
      mode,
      raw_candidate_count: 0,
      accepted_count: 0,
      rejected_count: 0,
      prompt_count: 0,
    },
  };
}
