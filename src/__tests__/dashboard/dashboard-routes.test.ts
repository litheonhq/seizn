import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_ROUTES,
  authorTabHref,
  canonicalAuthorDashboardPath,
  isAuthorWorkspaceTab,
  sanitizeDashboardCallbackUrl,
  shouldUseLocalAuthorTabNavigation,
} from '@/lib/dashboard-routes';

describe('dashboard route registry', () => {
  it('keeps Author account routes canonical', () => {
    expect(DASHBOARD_ROUTES.authorSettings).toBe('/dashboard/author/settings');
    expect(DASHBOARD_ROUTES.authorSettingsByok).toBe('/dashboard/author/settings?section=byok');
    expect(DASHBOARD_ROUTES.authorSettingsBilling).toBe('/dashboard/author/settings?section=billing');
    expect(DASHBOARD_ROUTES.authorUsage).toBe('/dashboard/author/usage');
  });

  it('builds Author tab URLs without legacy dashboard settings paths', () => {
    expect(authorTabHref('inbox')).toBe('/dashboard/author?tab=inbox');
    expect(authorTabHref('conflicts')).toBe('/dashboard/author?tab=conflicts');
    expect(authorTabHref('usage')).toBe('/dashboard/author?tab=usage');
    expect(isAuthorWorkspaceTab('settings')).toBe(false);
    expect(isAuthorWorkspaceTab('memories')).toBe(true);
    expect(isAuthorWorkspaceTab('usage')).toBe(true);
  });

  it('keeps /dashboard as the canonical overview and maps legacy entrypoints', () => {
    expect(canonicalAuthorDashboardPath('/dashboard')).toBe('/dashboard');
    expect(canonicalAuthorDashboardPath('/dashboard', '?from=engine')).toBe(
      '/dashboard?from=engine',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/settings/byok', '?from=engine')).toBe(
      '/dashboard/author/settings?from=engine&section=byok',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/author/usage')).toBe(
      '/dashboard/author?tab=usage',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/usage')).toBe('/dashboard/author?tab=usage');
    expect(canonicalAuthorDashboardPath('/dashboard/memories')).toBe('/dashboard/memories');
    expect(canonicalAuthorDashboardPath('/dashboard/memory-editor')).toBe('/dashboard/memory-editor');
    expect(canonicalAuthorDashboardPath('/dashboard/memories/mindmap')).toBe(
      '/dashboard/memories/mindmap',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/replay')).toBe('/dashboard/replay');
    expect(canonicalAuthorDashboardPath('/dashboard/account/api-keys')).toBe(
      '/dashboard/account/api-keys',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/account/api-keys', '?from=engine')).toBe(
      '/dashboard/account/api-keys?from=engine',
    );
    expect(canonicalAuthorDashboardPath('/dashboard/keys')).toBe('/dashboard/account/api-keys');
    expect(canonicalAuthorDashboardPath('/dashboard/billing')).toBe('/dashboard/billing');
  });

  it('only accepts local dashboard callback URLs', () => {
    expect(sanitizeDashboardCallbackUrl('/dashboard/author?tab=review')).toBe('/dashboard/author?tab=review');
    expect(sanitizeDashboardCallbackUrl('https://evil.example/dashboard')).toBe(DASHBOARD_ROUTES.root);
    expect(sanitizeDashboardCallbackUrl('/api/auth/session')).toBe(DASHBOARD_ROUTES.root);
    expect(sanitizeDashboardCallbackUrl('/dashboardish')).toBe(DASHBOARD_ROUTES.root);
  });

  it('only enables native tab switching on the canonical Author workspace page', () => {
    expect(shouldUseLocalAuthorTabNavigation('/dashboard/author', false)).toBe(true);
    expect(shouldUseLocalAuthorTabNavigation('/dashboard/author', true)).toBe(false);
    expect(shouldUseLocalAuthorTabNavigation('/dashboard/author/usage', false)).toBe(false);
    expect(shouldUseLocalAuthorTabNavigation('/dashboard/memories', false)).toBe(false);
  });
});
