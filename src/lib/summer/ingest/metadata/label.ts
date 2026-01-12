const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

const STOPWORDS = new Set([
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'for',
  'on',
  'with',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'this',
  'that',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Very lightweight metadata labeling (MVP).
 *
 * Upgrade path:
 * - Domain classifier (LLM or small model)
 * - Organization detection (NER)
 * - Research method tags
 */
export function autoLabelMetadata(text: string): Record<string, unknown> {
  const years = Array.from(new Set((text.match(YEAR_RE) ?? []).map((y) => Number(y)))).sort();
  const tokens = tokenize(text);

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);

  return {
    years: years.length ? years : undefined,
    keywords,
  };
}
