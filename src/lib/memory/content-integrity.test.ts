import { describe, expect, it } from 'vitest';
import { analyzeContentIntegrity } from './content-integrity';

describe('analyzeContentIntegrity', () => {
  it('returns no warnings for normal UTF-8 text', () => {
    const result = analyzeContentIntegrity('밀키픽스 법인 구조 확정: Delaware C-Corp');
    expect(result.warnings).toEqual([]);
  });

  it('detects replacement characters', () => {
    const result = analyzeContentIntegrity('정상 텍스트 � 깨짐');
    expect(result.warnings.some((w) => w.code === 'replacement_character_detected')).toBe(true);
  });

  it('detects likely mojibake sequences', () => {
    const result = analyzeContentIntegrity('ë°í¤í½ì¤ ë²ì¸ êµ¬ì¡°');
    expect(result.warnings.some((w) => w.code === 'possible_mojibake')).toBe(true);
  });

  it('detects high question mark ratio on long text', () => {
    const result = analyzeContentIntegrity(
      '?????????????????????????????????????????????????????????? this part is still broken'
    );
    expect(result.warnings.some((w) => w.code === 'high_question_mark_ratio')).toBe(true);
  });
});
