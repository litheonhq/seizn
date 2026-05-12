import { useEffect, useState } from 'react';
import { auditText, type AntiClicheFinding } from '@/lib/author/frameworks';
import { COACH_CLICHE_SCAN_DEBOUNCE_MS } from '@/lib/author/coach/config';

export function useDebouncedAntiCliche(
  text: string,
  delayMs = COACH_CLICHE_SCAN_DEBOUNCE_MS,
): AntiClicheFinding[] {
  const [findings, setFindings] = useState<AntiClicheFinding[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      setFindings(text ? auditText(text) : []);
    }, delayMs);
    return () => clearTimeout(handle);
  }, [text, delayMs]);
  return findings;
}

export function findingKey(finding: AntiClicheFinding): string {
  return `${finding.index}:${finding.match.toLowerCase()}`;
}
