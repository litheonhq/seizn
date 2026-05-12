import { describe, expect, it } from 'vitest';

import {
  CHARACTER_ARC_DIRECTIONS,
  SACRED_FLAW_ENGINE,
  STORR_CHARACTER_PROTOCOL,
  WANT_NEED_INVERSION_EXAMPLES,
  summarizeArc,
} from '../storr-arc';

describe('storr-arc', () => {
  it('exports three sacred flaw engine levels', () => {
    expect(SACRED_FLAW_ENGINE).toHaveLength(3);
    const levels = SACRED_FLAW_ENGINE.map((entry) => entry.level).sort();
    expect(levels).toEqual(['external_want', 'internal_need', 'philosophical_purpose']);
  });

  it('engine entries describe both what and example', () => {
    for (const entry of SACRED_FLAW_ENGINE) {
      expect(entry.what.length).toBeGreaterThan(5);
      expect(entry.example.length).toBeGreaterThan(5);
    }
  });

  it('arc directions cover positive, negative, flat', () => {
    expect(Object.keys(CHARACTER_ARC_DIRECTIONS).sort()).toEqual(['flat', 'negative', 'positive']);
  });

  it('exports want-need inversion examples', () => {
    expect(WANT_NEED_INVERSION_EXAMPLES.length).toBeGreaterThanOrEqual(4);
    for (const pair of WANT_NEED_INVERSION_EXAMPLES) {
      expect(pair.flaw.length).toBeGreaterThan(0);
      expect(pair.need.length).toBeGreaterThan(0);
    }
  });

  it('exports a 10-step Storr protocol', () => {
    expect(STORR_CHARACTER_PROTOCOL).toHaveLength(10);
  });

  it('summarizeArc formats key arc fields', () => {
    const summary = summarizeArc({
      sacredFlaw: 'Vulnerability is weakness.',
      externalWant: 'Win the tournament.',
      internalNeed: 'Trust her partner.',
      arcDirection: 'positive',
    });
    expect(summary).toContain('Sacred flaw: Vulnerability is weakness.');
    expect(summary).toContain('Want: Win the tournament.');
    expect(summary).toContain('Need: Trust her partner.');
    expect(summary).toContain('Arc: positive');
  });
});
