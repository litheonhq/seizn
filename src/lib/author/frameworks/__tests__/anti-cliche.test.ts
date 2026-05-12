import { describe, expect, it } from 'vitest';

import { BANNED_PHRASES, FRESHNESS_RULES, auditText } from '../anti-cliche';

describe('anti-cliche', () => {
  it('returns no findings for empty input', () => {
    expect(auditText('')).toEqual([]);
  });

  it('returns no findings for safe prose', () => {
    const findings = auditText(
      'She straightened the cushions one more time, then closed the door without looking back.',
    );
    expect(findings).toEqual([]);
  });

  it('flags the canonical opening cliche', () => {
    const findings = auditText('In a world where dragons rule, one boy stands alone.');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.category).toBe('opening');
    expect(findings[0]?.match.toLowerCase()).toContain('in a world where');
  });

  it('flags emotional cliches case-insensitively', () => {
    const findings = auditText('A Chill Ran Down her spine as the door creaked open.');
    expect(findings.some((f) => f.category === 'emotional')).toBe(true);
  });

  it('flags AI-specific cliches as a top category', () => {
    const findings = auditText('A tapestry of memories defined the captain.');
    expect(findings.some((f) => f.category === 'ai_specific')).toBe(true);
  });

  it('detects multiple categories in one passage', () => {
    const findings = auditText(
      'In a world where dragons rule, a chill ran down her spine and a tapestry of fears unfolded.',
    );
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has('opening')).toBe(true);
    expect(categories.has('emotional')).toBe(true);
    expect(categories.has('ai_specific')).toBe(true);
  });

  it('flags butterflies regardless of pronoun', () => {
    expect(auditText('butterflies in their stomach').length).toBeGreaterThan(0);
    expect(auditText('butterflies in her stomach').length).toBeGreaterThan(0);
    expect(auditText('butterflies in my stomach').length).toBeGreaterThan(0);
  });

  it('flags "you don\'t understand" with or without apostrophe', () => {
    expect(auditText("you don't understand")).toHaveLength(1);
    expect(auditText('you dont understand')).toHaveLength(1);
  });

  it('findings include a fresh alternative suggestion', () => {
    const [first] = auditText('It was a dark and stormy night.');
    expect(first?.freshAlternative.length).toBeGreaterThan(0);
    expect(first?.reason.length).toBeGreaterThan(0);
  });

  it('findings are sorted by source index', () => {
    const findings = auditText(
      'In a world where chaos reigned, a chill ran down her spine and her heart skipped a beat.',
    );
    for (let i = 1; i < findings.length; i += 1) {
      expect(findings[i].index).toBeGreaterThanOrEqual(findings[i - 1].index);
    }
  });

  it('detects all six categories at least once across the banned table', () => {
    const categories = new Set(BANNED_PHRASES.map((entry) => entry.category));
    expect(categories.size).toBe(6);
  });

  it('does not false-positive on benign sentences containing partial words', () => {
    // 'win' overlaps with 'wind' but no banned pattern is 'win' alone — sanity check
    expect(auditText('The wind tugged at her sleeve.')).toEqual([]);
    expect(auditText('He counted the coins twice.')).toEqual([]);
  });

  it('exports freshness rules', () => {
    expect(FRESHNESS_RULES.length).toBeGreaterThanOrEqual(6);
  });
});
