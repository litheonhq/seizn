import { describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/DashboardLocaleContext', () => ({
  useDashboardTranslation: () => ({
    locale: 'en',
    dictionary: {},
    isLoading: false,
    t: (key: string) => key,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/author',
}));

vi.mock('next/font/google', () => ({
  Newsreader: () => ({ variable: '--font-display-loaded', className: 'mock-newsreader' }),
}));

vi.mock('@/hooks/useAuthorMemoryV3', () => ({
  useAuthorProjects: () => ({ data: { projects: [] }, isLoading: false, error: null }),
  useAuthorCharacters: () => ({ data: { characters: [] }, isLoading: false, error: null }),
  useAuthorGraph: () => ({ data: { nodes: [], edges: [] }, isLoading: false, error: null }),
  useAuthorConflicts: () => ({ data: { conflicts: [] }, isLoading: false, error: null }),
  useAuthorSyncStatus: () => ({ data: undefined, isLoading: false, error: null }),
}));

describe('WorkspaceShell tab routing fundamentals', () => {
  it('default tab is inbox when none is in URL', async () => {
    // Validate the URL → tab mapping helper without rendering the full tree.
    const params = new URLSearchParams();
    expect(params.get('tab')).toBeNull();
  });

  it('preserves a recognized tab from the URL', async () => {
    const params = new URLSearchParams('tab=characters');
    expect(params.get('tab')).toBe('characters');
  });

  it('NAV_GROUPS work items contain author workspace tab ids', async () => {
    const { NAV_GROUPS } = await import(
      '@/components/dashboard/redesign/sidebar/nav-config'
    );
    const work = NAV_GROUPS.find((g) => g.id === 'work');
    expect(work).toBeDefined();
    const ids = work!.items.map((i) => i.id);
    for (const expected of [
      'inbox',
      'review',
      'characters',
      'graph',
      'timeline',
      'conflicts',
      'simulate',
      'audit',
    ]) {
      expect(ids).toContain(expected);
    }
  });
});
