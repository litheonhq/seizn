/**
 * Rough token estimator.
 *
 * - English: ~4 chars/token
 * - Korean: ~2 chars/token
 *
 * This is only used for chunk sizing and usage estimation.
 */
export function estimateTokens(text: string): number {
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}
