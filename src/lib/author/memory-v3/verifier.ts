import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
import type { JsonValue } from './canonical';
import type {
  AuthorEvalCase,
  AuthorEvalResult,
  AuthorMemoryRecord,
  AuthorMemorySnapshot,
  AuthorSideEffectRecord,
} from './types';

export interface AuthorEvalVerifierInput {
  testCase: AuthorEvalCase;
  output: string;
  records: AuthorMemoryRecord[];
  snapshot: AuthorMemorySnapshot;
  sideEffect: AuthorSideEffectRecord;
}

export interface AuthorEvalVerifierResult {
  passed: boolean;
  score: number;
  failures?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface AuthorEvalVerifier {
  verify(input: AuthorEvalVerifierInput): Promise<AuthorEvalVerifierResult> | AuthorEvalVerifierResult;
}

export function applyAuthorEvalVerifierResult(
  result: AuthorEvalResult,
  verifierResult: AuthorEvalVerifierResult
): AuthorEvalResult {
  const verifierFailures = verifierResult.failures ?? [];
  const failures = [...result.failures, ...verifierFailures];
  const passed = result.passed && verifierResult.passed && failures.length === 0;
  const score = Math.max(0, Math.min(1, Math.min(result.score, verifierResult.score)));

  return {
    ...result,
    passed,
    score,
    failures,
    metadata: {
      ...(result.metadata ?? {}),
      verifier: {
        passed: verifierResult.passed,
        score: verifierResult.score,
        ...(verifierResult.metadata ?? {}),
      },
    },
  };
}

export function createAnthropicAuthorEvalVerifier(options: {
  apiKey?: string;
  model?: string;
  maxRecords?: number;
} = {}): AuthorEvalVerifier {
  return {
    async verify(input) {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          passed: false,
          score: 0,
          failures: ['author eval judge is not configured'],
          metadata: {
            kind: 'anthropic_author_eval_judge',
            configured: false,
          },
        };
      }

      const model =
        options.model
        ?? process.env.AUTHOR_MEMORY_V3_JUDGE_MODEL
        ?? 'claude-3-5-sonnet-20241022';
      const records = input.records
        .slice(0, options.maxRecords ?? 40)
        .map((record) => `- [${record.id}] ${record.kind}/${record.status}: ${record.content}`)
        .join('\n')
        .slice(0, 24000);
      const prompt = [
        'Evaluate a fictional-authoring memory answer.',
        'Return ONLY compact JSON with keys: passed(boolean), score(number 0..1), failures(string array), explanation(string).',
        '',
        `CASE ID: ${input.testCase.id}`,
        `CASE KIND: ${input.testCase.kind}`,
        `PROMPT: ${input.testCase.prompt}`,
        `EXPECTED: ${JSON.stringify(input.testCase.expected)}`,
        '',
        'MEMORY RECORDS:',
        records,
        '',
        'ANSWER:',
        input.output,
      ].join('\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model,
          max_tokens: 500,
          temperature: 0,
          system: 'You are a strict evaluator for fictional canon, character knowledge, relationship continuity, and author-only leak checks.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        return {
          passed: false,
          score: 0,
          failures: [`author eval judge request failed: ${response.status}`],
          metadata: {
            kind: 'anthropic_author_eval_judge',
            configured: true,
            model,
          },
        };
      }

      const body = await response.json();
      const text = body?.content?.[0]?.text;
      if (typeof text !== 'string') {
        return {
          passed: false,
          score: 0,
          failures: ['author eval judge returned no text'],
          metadata: {
            kind: 'anthropic_author_eval_judge',
            configured: true,
            model,
          },
        };
      }

      try {
        const parsed = JSON.parse(text);
        const score = clampScore(parsed?.score);
        const failures = Array.isArray(parsed?.failures)
          ? parsed.failures.filter((item: unknown): item is string => typeof item === 'string')
          : [];

        const explanation = typeof parsed?.explanation === 'string'
          ? parsed.explanation
          : undefined;

        return {
          passed: Boolean(parsed?.passed) && failures.length === 0,
          score,
          failures,
          metadata: {
            kind: 'anthropic_author_eval_judge',
            configured: true,
            model,
            ...(explanation ? { explanation } : {}),
          },
        };
      } catch {
        return {
          passed: false,
          score: 0,
          failures: ['author eval judge returned invalid JSON'],
          metadata: {
            kind: 'anthropic_author_eval_judge',
            configured: true,
            model,
          },
        };
      }
    },
  };
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}
