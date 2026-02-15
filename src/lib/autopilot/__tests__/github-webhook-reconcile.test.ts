import { describe, it, expect } from 'vitest';
import { extractRepoFullNameFromUrl, matchesRepoFullName } from '../github-webhook-reconcile';

describe('autopilot github webhook reconcile', () => {
  describe('extractRepoFullNameFromUrl', () => {
    it('extracts owner/repo from GitHub UI PR URL', () => {
      expect(
        extractRepoFullNameFromUrl('https://github.com/iruhana/seizn/pull/123')
      ).toBe('iruhana/seizn');
    });

    it('extracts owner/repo from GitHub API PR URL', () => {
      expect(
        extractRepoFullNameFromUrl('https://api.github.com/repos/iruhana/seizn/pulls/123')
      ).toBe('iruhana/seizn');
    });

    it('returns null for non-PR URLs', () => {
      expect(extractRepoFullNameFromUrl('https://github.com/iruhana/seizn')).toBeNull();
      expect(extractRepoFullNameFromUrl('not-a-url')).toBeNull();
    });
  });

  describe('matchesRepoFullName', () => {
    it('prefers context.metadata.repoFullName match (case-insensitive)', () => {
      const prData = {
        context: {
          metadata: {
            repoFullName: 'IruHana/SeIzN',
          },
        },
        pr_url: 'https://github.com/other/repo/pull/1',
      };

      expect(matchesRepoFullName(prData as Record<string, unknown>, 'iruhana/seizn')).toBe(true);
    });

    it('matches based on URL fields when context metadata missing', () => {
      const prData = {
        external_pr_url: 'https://github.com/iruhana/seizn/pull/99',
      };

      expect(matchesRepoFullName(prData as Record<string, unknown>, 'iruhana/seizn')).toBe(true);
    });

    it('returns false when repo does not match', () => {
      const prData = {
        external_pr_url: 'https://github.com/iruhana/other/pull/99',
        context: { metadata: { repoFullName: 'iruhana/other' } },
      };

      expect(matchesRepoFullName(prData as Record<string, unknown>, 'iruhana/seizn')).toBe(false);
    });

    it('returns false when repoFullName is blank', () => {
      const prData = {
        external_pr_url: 'https://github.com/iruhana/seizn/pull/99',
      };

      expect(matchesRepoFullName(prData as Record<string, unknown>, '   ')).toBe(false);
    });
  });
});

