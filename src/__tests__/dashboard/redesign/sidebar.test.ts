import { describe, expect, it } from 'vitest';
import { NAV_GROUPS } from '@/components/dashboard/redesign/sidebar/nav-config';

describe('NAV_GROUPS structure', () => {
  it('has Workspace + Memory + Account groups in that order', () => {
    expect(NAV_GROUPS).toHaveLength(3);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['workspace', 'memory', 'account']);
  });

  it('has 8 + 4 + 3 = 15 items total', () => {
    const totals = NAV_GROUPS.map((g) => g.items.length);
    expect(totals).toEqual([8, 4, 3]);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(15);
  });

  it('every item has a labelKey, href, and icon component', () => {
    for (const group of NAV_GROUPS) {
      expect(group.labelKey).toMatch(/^dashboard\.nav\.groups\./);
      for (const item of group.items) {
        expect(item.labelKey.startsWith('dashboard.nav.')).toBe(true);
        expect(item.href.startsWith('/dashboard/')).toBe(true);
        expect(typeof item.icon).toBe('function');
      }
    }
  });

  it('workspace group items all route under /dashboard/author?tab=', () => {
    const workspace = NAV_GROUPS.find((g) => g.id === 'workspace');
    expect(workspace).toBeDefined();
    for (const item of workspace!.items) {
      expect(item.href.startsWith('/dashboard/author?tab=')).toBe(true);
    }
  });

  it('Conflicts item carries the dotKey for the P1 indicator', () => {
    const workspace = NAV_GROUPS.find((g) => g.id === 'workspace');
    const conflicts = workspace?.items.find((i) => i.id === 'conflicts');
    expect(conflicts?.dotKey).toBe('conflicts.has_p1');
  });

  it('byok and settings live in the account group', () => {
    const account = NAV_GROUPS.find((g) => g.id === 'account');
    const ids = account?.items.map((i) => i.id);
    expect(ids).toContain('byok');
    expect(ids).toContain('settings');
    expect(ids).toContain('usage');
  });

  it('does not reference any legacy /dashboard/_legacy routes', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.href.includes('/_legacy/')).toBe(false);
        expect(item.href.includes('/legacy/')).toBe(false);
      }
    }
  });
});
