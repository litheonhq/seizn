import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_ROUTES,
  authorTabHref,
  isAuthorWorkspaceTab,
  sanitizeDashboardCallbackUrl,
} from '@/lib/dashboard-routes';

describe('dashboard route registry', () => {
  it('keeps Author account routes canonical', () => {
    expect(DASHBOARD_ROUTES.authorSettings).toBe('/dashboard/author/settings');
    expect(DASHBOARD_ROUTES.authorSettingsByok).toBe('/dashboard/author/settings?section=byok');
    expect(DASHBOARD_ROUTES.authorUsage).toBe('/dashboard/author/usage');
  });

  it('builds Author tab URLs without legacy dashboard settings paths', () => {
    expect(authorTabHref('inbox')).toBe('/dashboard/author?tab=inbox');
    expect(authorTabHref('conflicts')).toBe('/dashboard/author?tab=conflicts');
    expect(authorTabHref('memories')).toBe('/dashboard/author?tab=memories');
    expect(authorTabHref('memory-edit')).toBe('/dashboard/author?tab=memory-edit');
    expect(isAuthorWorkspaceTab('settings')).toBe(false);
    expect(isAuthorWorkspaceTab('memories')).toBe(true);
  });

  it('only accepts local dashboard callback URLs', () => {
    expect(sanitizeDashboardCallbackUrl('/dashboard/author?tab=review')).toBe('/dashboard/author?tab=review');
    expect(sanitizeDashboardCallbackUrl('https://evil.example/dashboard')).toBe(DASHBOARD_ROUTES.author);
    expect(sanitizeDashboardCallbackUrl('/api/auth/session')).toBe(DASHBOARD_ROUTES.author);
    expect(sanitizeDashboardCallbackUrl('/dashboardish')).toBe(DASHBOARD_ROUTES.author);
  });
});
