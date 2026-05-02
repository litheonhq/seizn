import characterRegistry from '../../../../docs/knot-input/character_registry.json';
import worldRuleRegistry from '../../../../docs/knot-input/world_rule_registry.json';
import type { AuthorJsonSchema, AuthorLlmRequest, AuthorLlmResponse } from '@/lib/author/llm';
import { generateAuthorAnthropic } from '@/lib/author/llm';
import characterSchema from './schemas/candidate-character.json';
import worldRuleSchema from './schemas/candidate-world-rule.json';
import eventSchema from './schemas/candidate-event.json';
import relationshipSchema from './schemas/candidate-relationship.json';
import voiceSampleSchema from './schemas/candidate-voice-sample.json';
import { buildExtractionPrompt, AUTHOR_EXTRACTION_TASKS } from './prompt-catalog';
import { validateExtractedCandidates } from './validator';
import type {
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

interface ExtractAuthorCandidatesDeps {
  mode?: 'llm' | 'heuristic';
  generate?: (request: AuthorLlmRequest) => Promise<AuthorLlmResponse<LlmCandidateResponse>>;
}

const SCHEMAS: Record<string, AuthorJsonSchema> = {
  character: characterSchema as AuthorJsonSchema,
  world_rule: worldRuleSchema as AuthorJsonSchema,
  event: eventSchema as AuthorJsonSchema,
  relationship: relationshipSchema as AuthorJsonSchema,
  voice_sample: voiceSampleSchema as AuthorJsonSchema,
};

const MAX_PROMPT_CHARS = 12000;

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
    ? await extractWithLlm(input, text, deps.generate ?? generateAuthorAnthropic)
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
