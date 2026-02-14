/**
 * GitHub webhook helpers for Autopilot.
 *
 * Keep these helpers pure so they can be unit tested without Next.js runtime.
 */

export function extractCheckSuitePRNumbers(checkSuite: Record<string, unknown>): number[] {
  const prs = checkSuite.pull_requests;
  if (!Array.isArray(prs)) return [];

  const numbers: number[] = [];
  for (const pr of prs) {
    if (!pr || typeof pr !== 'object') continue;
    const n = (pr as Record<string, unknown>).number;
    if (typeof n === 'number' && Number.isFinite(n)) {
      numbers.push(n);
    }
  }

  // De-dupe while preserving order.
  return Array.from(new Set(numbers));
}

export function extractCheckSuiteHeadBranch(checkSuite: Record<string, unknown>): string | null {
  const headBranch = checkSuite.head_branch;
  if (typeof headBranch !== 'string') return null;
  const trimmed = headBranch.trim();
  return trimmed ? trimmed : null;
}

