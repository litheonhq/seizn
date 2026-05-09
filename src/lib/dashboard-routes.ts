export const DASHBOARD_ROUTES = {
  root: '/dashboard',
  author: '/dashboard/author',
  authorSettings: '/dashboard/author/settings',
  authorSettingsByok: '/dashboard/author/settings?section=byok',
  authorUsage: '/dashboard/author/usage',
  memories: '/dashboard/memories',
  memoryEditor: '/dashboard/memory-editor',
  mindmap: '/dashboard/memories/mindmap',
  replay: '/dashboard/replay',
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
  'memories',
  'memory-edit',
  'mindmap',
  'replay',
  'usage',
] as const;

export type AuthorWorkspaceTab = (typeof AUTHOR_WORKSPACE_TABS)[number];

export const AUTHOR_TAB_LABEL_KEYS: Record<AuthorWorkspaceTab, string> = {
  inbox: 'dashboard.nav.inbox',
  review: 'dashboard.nav.review',
  characters: 'dashboard.nav.characters',
  graph: 'dashboard.nav.graph',
  timeline: 'dashboard.nav.timeline',
  conflicts: 'dashboard.nav.conflicts',
  simulate: 'dashboard.nav.simulate',
  audit: 'dashboard.nav.audit',
  memories: 'dashboard.nav.memories',
  'memory-edit': 'dashboard.nav.memoryEditor',
  mindmap: 'dashboard.nav.mindMap',
  replay: 'dashboard.nav.replay',
  usage: 'dashboard.nav.usage',
};

export function authorTabHref(tab: AuthorWorkspaceTab): string {
  return `${DASHBOARD_ROUTES.author}?tab=${tab}`;
}

function withSearch(path: string, search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function authorTabPath(tab: AuthorWorkspaceTab, search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set('tab', tab);
  return `${DASHBOARD_ROUTES.author}?${params.toString()}`;
}

function authorSettingsPath(search: string, section?: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (section) {
    params.set('section', section);
  }
  const query = params.toString();
  return query ? `${DASHBOARD_ROUTES.authorSettings}?${query}` : DASHBOARD_ROUTES.authorSettings;
}

export function canonicalAuthorDashboardPath(pathname: string, search = ''): string | null {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  switch (normalizedPathname) {
    case DASHBOARD_ROUTES.root:
      return withSearch(DASHBOARD_ROUTES.author, search);
    case DASHBOARD_ROUTES.author:
    case DASHBOARD_ROUTES.authorSettings:
      return withSearch(normalizedPathname, search);
    case DASHBOARD_ROUTES.authorUsage:
      return authorTabPath('usage', search);
    case DASHBOARD_ROUTES.genericSettings:
    case DASHBOARD_ROUTES.legacyAuthorSettings:
      return authorSettingsPath(search);
    case DASHBOARD_ROUTES.legacyByokSettings:
      return authorSettingsPath(search, 'byok');
    case DASHBOARD_ROUTES.legacyUsage:
      return authorTabPath('usage', search);
    case DASHBOARD_ROUTES.memories:
      return withSearch(DASHBOARD_ROUTES.memories, search);
    case DASHBOARD_ROUTES.memoryEditor:
      return withSearch(DASHBOARD_ROUTES.memoryEditor, search);
    case DASHBOARD_ROUTES.mindmap:
      return withSearch(DASHBOARD_ROUTES.mindmap, search);
    case DASHBOARD_ROUTES.replay:
      return withSearch(DASHBOARD_ROUTES.replay, search);
    default:
      return null;
  }
}

export function isAuthorWorkspaceTab(value: string | null | undefined): value is AuthorWorkspaceTab {
  return value != null && (AUTHOR_WORKSPACE_TABS as readonly string[]).includes(value);
}

export function getAuthorTabLabelKey(value: string | null | undefined): string {
  return isAuthorWorkspaceTab(value) ? AUTHOR_TAB_LABEL_KEYS[value] : 'dashboard.topBar.workspace';
}

export function shouldUseLocalAuthorTabNavigation(
  pathname: string | null | undefined,
  hasRouteChildren: boolean
): boolean {
  return pathname === DASHBOARD_ROUTES.author && !hasRouteChildren;
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
