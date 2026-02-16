import { estimateTokens } from '@/lib/summer/utils/tokens';
import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';

export interface FaithfulnessJudgeResult {
  score: number; // 0..1
  explanation?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * LLM-as-a-judge faithfulness scoring.
 *
 * This is optional (costly). Prefer deterministic metrics where possible.
 */
export async function judgeFaithfulness(params: {
  answer: string;
  contextChunks: { id: string; text: string }[];
  model?: 'haiku' | 'sonnet';
}): Promise<FaithfulnessJudgeResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = params.model === 'haiku' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022';

  const context = params.contextChunks
    .slice(0, 12)
    .map((c) => `- [${c.id}] ${c.text}`)
    .join('\n')
    .slice(0, 12000);

  const system = `You are a strict RAG evaluator. Return ONLY valid JSON.`;
  const user = `Score how faithful the ANSWER is to the CONTEXT.\n\nCONTEXT:\n${context}\n\nANSWER:\n${params.answer}\n\nReturn JSON:\n{\n  "score": 0..1,\n  "explanation": "..."\n}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 250,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json();
  const text = json?.content?.[0]?.text ?? '';
  try {
    const parsed = JSON.parse(text);
    const score = Number(parsed?.score);
    if (!Number.isFinite(score)) return null;

    return {
      score: Math.max(0, Math.min(1, score)),
      explanation: typeof parsed?.explanation === 'string' ? parsed.explanation : undefined,
      model,
      inputTokens: estimateTokens(user),
      outputTokens: estimateTokens(text),
    };
  } catch {
    return null;
  }
}
