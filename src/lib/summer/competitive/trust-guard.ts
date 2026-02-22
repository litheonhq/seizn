import type { VectorSearchResult } from '../types';

export interface TrustGuardOptions {
  minTrustScore?: number;
  blockedSources?: string[];
  dropPromptInjectionLikeChunks?: boolean;
}

export interface TrustGuardReason {
  chunkId: string;
  reason: string;
}

export interface TrustGuardResult {
  accepted: VectorSearchResult[];
  rejected: VectorSearchResult[];
  filteredCount: number;
  reasons: TrustGuardReason[];
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|the) previous instructions/i,
  /system prompt/i,
  /developer message/i,
  /act as .* assistant/i,
  /do not follow/i,
  /이전 지시.*무시/,
  /시스템 프롬프트/,
];

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function applyTrustGuard(
  results: VectorSearchResult[],
  options: TrustGuardOptions = {}
): TrustGuardResult {
  const minTrustScore = options.minTrustScore ?? 0.35;
  const blockedSources = new Set((options.blockedSources ?? []).map((value) => value.toLowerCase()));
  const rejectPromptLikeChunks = options.dropPromptInjectionLikeChunks ?? true;

  const accepted: VectorSearchResult[] = [];
  const rejected: VectorSearchResult[] = [];
  const reasons: TrustGuardReason[] = [];

  for (const result of results) {
    const metadata = result.metadata ?? {};
    const trustScore = toNumber(metadata.trust_score);
    const metadataSource = typeof metadata.source === 'string' ? metadata.source.toLowerCase() : '';
    const resultSource = (result.source || '').toLowerCase();
    const combinedSource = metadataSource || resultSource;

    if (trustScore !== null && trustScore < minTrustScore) {
      rejected.push(result);
      reasons.push({ chunkId: result.chunkId, reason: `trust_score_below_threshold:${trustScore}` });
      continue;
    }

    if (typeof metadata.is_untrusted === 'boolean' && metadata.is_untrusted) {
      rejected.push(result);
      reasons.push({ chunkId: result.chunkId, reason: 'metadata_marked_untrusted' });
      continue;
    }

    if (combinedSource && blockedSources.has(combinedSource)) {
      rejected.push(result);
      reasons.push({ chunkId: result.chunkId, reason: `blocked_source:${combinedSource}` });
      continue;
    }

    if (rejectPromptLikeChunks && PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(result.text))) {
      rejected.push(result);
      reasons.push({ chunkId: result.chunkId, reason: 'prompt_injection_pattern_detected' });
      continue;
    }

    accepted.push(result);
  }

  return {
    accepted,
    rejected,
    filteredCount: rejected.length,
    reasons,
  };
}

