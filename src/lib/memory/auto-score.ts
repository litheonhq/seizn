/**
 * Auto Importance Scoring
 *
 * Uses Claude Haiku to rate memory importance (1-10).
 * Lightweight: ~50 tokens per call, <500ms latency.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Score the importance of a memory using Claude Haiku.
 * Returns 1-10 (5 = default on failure).
 */
export async function scoreImportance(content: string): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 5;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [
          {
            role: 'user',
            content: `Rate the importance of this memory on a scale of 1-10 (1=trivial daily detail, 5=moderately useful, 10=critical personal/professional fact). Reply with ONLY a single number.\n\n"${content.slice(0, 500)}"`,
          },
        ],
      }),
    });

    if (!response.ok) return 5;

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim();
    const score = parseInt(text, 10);
    return isNaN(score) ? 5 : Math.min(10, Math.max(1, score));
  } catch {
    return 5;
  }
}
