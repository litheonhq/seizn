/**
 * Autopilot GitHub webhook reconciliation helpers.
 *
 * Goal: prevent cross-repo PR-number collisions from triggering merges/cleanup
 * against the wrong repository.
 */

export function extractRepoFullNameFromUrl(url: string): string | null {
  const uiMatch = /github\.com\/([^/]+\/[^/]+)\/pull\//i.exec(url);
  if (uiMatch?.[1]) return uiMatch[1];

  const apiMatch = /api\.github\.com\/repos\/([^/]+\/[^/]+)\/pulls\//i.exec(url);
  if (apiMatch?.[1]) return apiMatch[1];

  return null;
}

export function matchesRepoFullName(
  prData: Record<string, unknown>,
  repoFullName: string
): boolean {
  const expected = repoFullName.trim().toLowerCase();

  const context = prData.context as Record<string, unknown> | undefined;
  const metadata = context?.metadata as Record<string, unknown> | undefined;
  const metaRepo = metadata?.repoFullName;
  if (typeof metaRepo === 'string' && metaRepo.trim().toLowerCase() === expected) {
    return true;
  }

  const urlFields = ['external_pr_url', 'pr_url', 'externalPrUrl', 'prUrl'] as const;
  for (const field of urlFields) {
    const value = prData[field];
    if (typeof value !== 'string' || !value) continue;

    const extracted = extractRepoFullNameFromUrl(value);
    if (extracted && extracted.toLowerCase() === expected) {
      return true;
    }
  }

  return false;
}

