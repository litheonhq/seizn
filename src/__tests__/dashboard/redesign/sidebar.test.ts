import { describe, expect, it } from 'vitest';
import {
  NAV_GROUPS,
  filterNavGroupsByCapability,
} from '@/components/dashboard/redesign/sidebar/nav-config';
import { DASHBOARD_ROUTES } from '@/lib/dashboard-routes';

describe('NAV_GROUPS structure', () => {
  it('has Work + Memory + Developer + Account + Admin groups in that order', () => {
    expect(NAV_GROUPS).toHaveLength(5);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      'work',
      'memory',
      'developer',
      'account',
      'admin',
    ]);
  });

  it('has the expected items per group', () => {
    const totals = NAV_GROUPS.map((g) => g.items.length);
    expect(totals).toEqual([10, 4, 2, 3, 1]);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('every item has a labelKey, href, and icon component', () => {
    for (const group of NAV_GROUPS) {
      expect(group.labelKey).toMatch(/^dashboard\.nav\.groups\./);
      for (const item of group.items) {
        expect(item.labelKey.startsWith('dashboard.nav.')).toBe(true);
        expect(item.href.startsWith('/dashboard') || item.href.startsWith('/en/admin')).toBe(true);
        expect(typeof item.icon).toBe('function');
      }
    }
  });

  it('work group starts with the canonical overview and keeps author workflow tabs together', () => {
    const work = NAV_GROUPS.find((g) => g.id === 'work');
    expect(work).toBeDefined();
    expect(work?.items[0]).toMatchObject({
      id: 'overview',
      href: DASHBOARD_ROUTES.root,
    });
    for (const item of work!.items.slice(1)) {
      expect(item.href.startsWith('/dashboard/author?tab=')).toBe(true);
    }
  });

  it('memory group items stay inside the Author surface', () => {
    const memory = NAV_GROUPS.find((g) => g.id === 'memory');
    expect(memory).toBeDefined();
    expect(memory?.items.map((item) => [item.id, item.href])).toEqual([
      ['memories', DASHBOARD_ROUTES.memories],
      ['memory-edit', DASHBOARD_ROUTES.memoryEditor],
      ['mindmap', DASHBOARD_ROUTES.mindmap],
      ['replay', DASHBOARD_ROUTES.replay],
    ]);
  });

  it('Conflicts item carries the dotKey for the P1 indicator', () => {
    const work = NAV_GROUPS.find((g) => g.id === 'work');
    const conflicts = work?.items.find((i) => i.id === 'conflicts');
    expect(conflicts?.dotKey).toBe('conflicts.has_p1');
  });

  it('developer links carry API/MCP work', () => {
    const developer = NAV_GROUPS.find((g) => g.id === 'developer');
    const ids = developer?.items.map((i) => i.id);
    expect(ids).toContain('api-keys');
    expect(ids).toContain('usage');
  });

  it('account links include BYOK, settings, and billing', () => {
    const account = NAV_GROUPS.find((g) => g.id === 'account');
    expect(account?.items.map((item) => [item.id, item.href])).toEqual([
      ['byok', DASHBOARD_ROUTES.authorSettingsByok],
      ['settings', DASHBOARD_ROUTES.authorSettings],
      ['billing', DASHBOARD_ROUTES.billing],
    ]);
  });

  it('filters capability-gated groups and items', () => {
    const visible = filterNavGroupsByCapability(NAV_GROUPS, {
      billing: true,
      track2: false,
      admin: false,
    });
    expect(visible.map((group) => group.id)).toEqual(['work', 'memory', 'developer', 'account']);
    expect(visible.flatMap((group) => group.items.map((item) => item.id))).toContain('billing');
    expect(visible.flatMap((group) => group.items.map((item) => item.id))).not.toContain('admin-metrics');

    const adminVisible = filterNavGroupsByCapability(NAV_GROUPS, {
      billing: true,
      track2: true,
      admin: true,
    });
    expect(adminVisible.map((group) => group.id)).toContain('admin');
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
