import { describe, expect, it } from 'vitest';

import {
  buildHighlightedMarkup,
  escapeHtml,
} from '@/components/dashboard/redesign/views/coach-view';
import { auditText } from '@/lib/author/frameworks';

describe('coach-view buildHighlightedMarkup', () => {
  it('escapes HTML special characters in plain segments', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('returns the input unchanged (plus trailing zero-width) when no findings', () => {
    const out = buildHighlightedMarkup('safe text', []);
    expect(out).toContain('safe text');
    expect(out).not.toContain('<mark');
  });

  it('wraps a single cliche in a <mark> with category background', () => {
    const text = 'In a world where dragons reign.';
    const findings = auditText(text);
    expect(findings.length).toBeGreaterThan(0);
    const html = buildHighlightedMarkup(text, findings);
    expect(html.toLowerCase()).toContain('<mark');
    expect(html.toLowerCase()).toContain('in a world where');
    expect(html).toContain('background:rgba');
  });

  it('produces non-overlapping marks even when input findings overlap', () => {
    const text = 'In a world where chaos reigns.';
    const findings = auditText(text);
    // synthesize an overlapping finding to confirm later overlaps are dropped
    const synthetic = [
      ...findings,
      {
        match: 'a world',
        index: 3,
        category: 'opening' as const,
        reason: 'overlap probe',
        freshAlternative: '...',
      },
    ];
    const html = buildHighlightedMarkup(text, synthetic);
    const markCount = (html.match(/<mark/g) ?? []).length;
    // Should be 1 — the original "In a world where" — overlapping "a world" is dropped.
    expect(markCount).toBe(1);
  });

  it('escapes content inside the highlighted segment too', () => {
    const text = 'In a world where <evil> appears.';
    const findings = auditText(text);
    const html = buildHighlightedMarkup(text, findings);
    expect(html).toContain('&lt;evil&gt;');
    expect(html).not.toContain('<evil>');
  });
});
