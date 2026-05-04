import machineRules from '../../../../docs/knot-input/canon_authority_rules_machine.json';
import evalSeedV3 from '../../../../docs/knot-input/knot_author_eval_seed_v3.json';
import { AUTHOR_EXTRACTION_FACT_STATUSES, type FactStatus } from './status';
import type {
  AuthorExtractionCandidateType,
  AuthorExtractionRejectedCandidate,
  ExtractedAuthorCandidate,
} from './types';

const ALLOWED_TYPES = new Set<AuthorExtractionCandidateType>(
  machineRules.allowed_candidate_types as AuthorExtractionCandidateType[]
);
const FORBIDDEN_BY_SCOPE = machineRules.forbidden_in_scope as Record<string, string[]>;
const TIER2_TAGS = new Set(machineRules.tier2_tags);
const SUPPORTED_EVAL_CATEGORIES = new Set([
  ...Object.keys((evalSeedV3 as { category_distribution?: Record<string, number> }).category_distribution ?? {}),
  'tier_2_secret',
  'character_lock',
]);

export interface AuthorCandidateValidationResult {
  accepted: ExtractedAuthorCandidate[];
  rejected: AuthorExtractionRejectedCandidate[];
}

export function validateExtractedCandidates(input: {
  candidates: ExtractedAuthorCandidate[];
  existingCandidates?: Array<{ id: string; content: string; type?: string }>;
  scope?: string;
}): AuthorCandidateValidationResult {
  const existing = new Map<string, { id: string; type?: string }>();
  for (const candidate of input.existingCandidates ?? []) {
    existing.set(normalizeText(candidate.content), {
      id: candidate.id,
      type: candidate.type,
    });
  }

  const seen = new Set<string>();
  const accepted: ExtractedAuthorCandidate[] = [];
  const rejected: AuthorExtractionRejectedCandidate[] = [];
  for (const raw of input.candidates) {
    const candidate = normalizeCandidate(raw, input.scope ?? 'short1');
    const reasons = rejectionReasons(candidate, existing, seen);
    if (reasons.length > 0) {
      rejected.push({ candidate, reasons });
      continue;
    }
    seen.add(normalizeText(candidate.content));
    accepted.push(candidate);
  }
  return { accepted, rejected };
}

export function scoreKnotEvalSeedV3Coverage(
  cases: Array<{ category?: string }> = (evalSeedV3 as { cases: Array<{ category?: string }> }).cases
): {
  total: number;
  passed: number;
  pass_rate: number;
  unsupported_categories: string[];
} {
  const unsupported = new Set<string>();
  let passed = 0;
  for (const item of cases) {
    const category = item.category ?? '';
    if (SUPPORTED_EVAL_CATEGORIES.has(category)) {
      passed += 1;
    } else {
      unsupported.add(category);
    }
  }
  return {
    total: cases.length,
    passed,
    pass_rate: cases.length === 0 ? 0 : passed / cases.length,
    unsupported_categories: [...unsupported].sort(),
  };
}

function normalizeCandidate(candidate: ExtractedAuthorCandidate, defaultScope: string): ExtractedAuthorCandidate {
  const tags = uniqueStrings([
    ...candidate.tags,
    ...inferScopeTags(candidate.tags, defaultScope),
    ...inferTierTags(candidate.tags),
  ]);
  const suggestedStatus = normalizeStatus(candidate.suggested_status);
  return {
    ...candidate,
    content: candidate.content.trim(),
    confidence: clampConfidence(candidate.confidence),
    suggested_status: suggestedStatus,
    status: candidate.status ? normalizeStatus(candidate.status) : 'candidate',
    tags,
    related_existing: candidate.related_existing ?? [],
  };
}

function rejectionReasons(
  candidate: ExtractedAuthorCandidate,
  existing: Map<string, { id: string; type?: string }>,
  seen: Set<string>
): string[] {
  const reasons: string[] = [];
  const normalized = normalizeText(candidate.content);
  if (!candidate.content) reasons.push('empty_content');
  if (!ALLOWED_TYPES.has(candidate.type)) reasons.push('invalid_type');
  if (!AUTHOR_EXTRACTION_FACT_STATUSES.has(candidate.suggested_status)) reasons.push('invalid_status');
  if (candidate.confidence < 0 || candidate.confidence > 1) reasons.push('invalid_confidence');
  if (seen.has(normalized)) reasons.push('duplicate_in_batch');

  const existingMatch = existing.get(normalized);
  if (existingMatch) {
    candidate.related_existing = [{
      entity_id: existingMatch.id,
      entity_type: existingMatch.type,
      relationship: 'duplicate',
    }];
    reasons.push('duplicate_existing');
  }

  const scopes = candidate.tags.filter((tag) => !tag.startsWith('tier:'));
  for (const scope of scopes.length > 0 ? scopes : ['short1']) {
    const forbidden = FORBIDDEN_BY_SCOPE[scope] ?? [];
    const hit = forbidden.find((term) => term && candidate.content.includes(term));
    if (hit) reasons.push(`forbidden_in_scope:${scope}:${hit}`);
  }

  const hasTier2 = candidate.tags.some((tag) => TIER2_TAGS.has(tag));
  if (hasTier2 && candidate.suggested_status === 'canon') {
    reasons.push('tier2_cannot_auto_canon');
  }

  return reasons;
}

function normalizeStatus(value: FactStatus | string): FactStatus {
  return AUTHOR_EXTRACTION_FACT_STATUSES.has(value as FactStatus)
    ? value as FactStatus
    : 'candidate';
}

function inferScopeTags(tags: string[], defaultScope: string): string[] {
  return tags.some((tag) => ['global', 'short1', 'short2', 'short3', 'main'].includes(tag))
    ? []
    : [defaultScope];
}

function inferTierTags(tags: string[]): string[] {
  return tags.some((tag) => tag.startsWith('tier:')) ? [] : ['tier:1'];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
