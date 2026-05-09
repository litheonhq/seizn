export const DASHBOARD_ROUTES = {
  root: '/dashboard',
  author: '/dashboard/author',
  authorSettings: '/dashboard/author/settings',
  authorSettingsByok: '/dashboard/author/settings?section=byok',
  authorUsage: '/dashboard/author/usage',
  genericSettings: '/dashboard/settings',
  legacyAuthorSettings: '/dashboard/settings/author',
  legacyByokSettings: '/dashboard/settings/byok',
  apiKeys: '/dashboard/account/api-keys',
  legacyApiKeys: '/dashboard/keys',
  legacyUsage: '/dashboard/usage',
} as const;

export const AUTHOR_WORKSPACE_TABS = [
  'inbox',
  'review',
  'characters',
  'graph',
  'timeline',
  'conflicts',
  'simulate',
  'audit',
] as const;

export type AuthorWorkspaceTab = (typeof AUTHOR_WORKSPACE_TABS)[number];

export function authorTabHref(tab: AuthorWorkspaceTab): string {
  return `${DASHBOARD_ROUTES.author}?tab=${tab}`;
}

export function isAuthorWorkspaceTab(value: string | null | undefined): value is AuthorWorkspaceTab {
  return value != null && (AUTHOR_WORKSPACE_TABS as readonly string[]).includes(value);
}

export function sanitizeDashboardCallbackUrl(value: string | null | undefined): string {
  if (!value) return DASHBOARD_ROUTES.author;
  if (!value.startsWith('/') || value.startsWith('//')) return DASHBOARD_ROUTES.author;
  try {
    const parsed = new URL(value, 'https://www.seizn.com');
    const dashboardPath = parsed.pathname === '/dashboard' || parsed.pathname.startsWith('/dashboard/');
    if (!dashboardPath) return DASHBOARD_ROUTES.author;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DASHBOARD_ROUTES.author;
  }
}
