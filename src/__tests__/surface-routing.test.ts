import { describe, expect, it } from 'vitest';
import { isEngineMarketingRoute, stripLocalePrefix } from '@/lib/surface';

describe('surface routing helpers', () => {
  it('recognizes game/NPC marketing routes as Engine-owned', () => {
    expect(isEngineMarketingRoute('/comparison')).toBe(true);
    expect(isEngineMarketingRoute('/ko/comparison')).toBe(true);
    expect(isEngineMarketingRoute('/bench/methodology')).toBe(true);
    expect(isEngineMarketingRoute('/en/design-partners')).toBe(true);
    expect(isEngineMarketingRoute('/enterprise')).toBe(true);
    expect(isEngineMarketingRoute('/ja/playground')).toBe(true);
  });

  it('keeps Author routes on the Author surface', () => {
    expect(isEngineMarketingRoute('/en')).toBe(false);
    expect(isEngineMarketingRoute('/en/docs')).toBe(false);
    expect(isEngineMarketingRoute('/en/docs/quickstart')).toBe(false);
    expect(isEngineMarketingRoute('/ko/pricing')).toBe(false);
    expect(isEngineMarketingRoute('/dashboard/author')).toBe(false);
    expect(stripLocalePrefix('/ko/pricing')).toBe('/pricing');
  });
});
