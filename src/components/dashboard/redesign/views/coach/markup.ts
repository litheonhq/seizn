// Pure helpers for the Coach view's inline highlight overlay.
// Extracted from coach-view.tsx so they can be unit-tested without rendering
// and so future consumers (e.g. memo editor, draft preview) can reuse them.

import type { AntiClicheCategory, AntiClicheFinding } from '@/lib/author/frameworks';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const HIGHLIGHT_PALETTE: Record<AntiClicheCategory, string> = {
  opening: 'rgba(122, 92, 58, 0.22)',
  emotional: 'rgba(201, 100, 66, 0.22)',
  description: 'rgba(216, 168, 109, 0.28)',
  action: 'rgba(122, 92, 58, 0.22)',
  dialogue: 'rgba(112, 130, 152, 0.24)',
  ai_specific: 'rgba(201, 100, 66, 0.32)',
};

export function buildHighlightedMarkup(text: string, findings: AntiClicheFinding[]): string {
  if (findings.length === 0) {
    return escapeHtml(text) + '​';
  }
  // Findings must be non-overlapping; if any overlap we keep the earliest.
  const ordered = [...findings].sort((a, b) => a.index - b.index);
  const trimmed: AntiClicheFinding[] = [];
  let lastEnd = -1;
  for (const finding of ordered) {
    if (finding.index < lastEnd) continue;
    trimmed.push(finding);
    lastEnd = finding.index + finding.match.length;
  }
  let cursor = 0;
  let html = '';
  for (const finding of trimmed) {
    if (finding.index > cursor) {
      html += escapeHtml(text.slice(cursor, finding.index));
    }
    const segment = escapeHtml(text.slice(finding.index, finding.index + finding.match.length));
    const color = HIGHLIGHT_PALETTE[finding.category];
    html += `<mark style="background:${color};color:inherit;border-radius:2px;padding:0 1px;">${segment}</mark>`;
    cursor = finding.index + finding.match.length;
  }
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }
  // Trailing zero-width ensures the overlay matches textarea height even on a trailing newline.
  return html + '​';
}
