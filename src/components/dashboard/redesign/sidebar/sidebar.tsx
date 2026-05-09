'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { DASHBOARD_ROUTES, type AuthorWorkspaceTab } from '@/lib/dashboard-routes';
import { Kbd } from '../atoms';
import { SearchIcon } from '../icons';
import type { Density, MemoryHealthState } from '../types';
import { MemoryHealth } from './memory-health';
import {
  NAV_GROUPS,
  type NavBadgeMap,
  type NavDotMap,
  type NavItem,
} from './nav-config';
import { SidebarGroup } from './sidebar-group';
import { SidebarItem } from './sidebar-item';
import { UserCard } from './user-card';
import { WorkspaceSwitcher } from './workspace-switcher';

export interface SidebarProps {
  collapsed?: boolean;
  density?: Density;
  workspaceName: string;
  workspacePlanLabel: string;
  workspaceEntries: number;
  workspaceHasMore?: boolean;
  userName: string;
  userPlanLabel: string;
  memoryHealth: MemoryHealthState;
  badges?: NavBadgeMap;
  dots?: NavDotMap;
  onCommandPalette?: () => void;
  activeAuthorTab?: AuthorWorkspaceTab;
  onAuthorTab?: (tab: AuthorWorkspaceTab) => void;
}

function formatRelative(date: Date, now: Date = new Date()): string {
  const diffSec = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function isItemActive(
  item: NavItem,
  pathname: string | null,
  tab: string | null,
  section: string | null
): boolean {
  if (!pathname) return false;

  if (item.id === 'usage' && pathname.startsWith(DASHBOARD_ROUTES.authorUsage)) return true;

  if (item.href.startsWith('/dashboard/author?tab=')) {
    if (pathname !== DASHBOARD_ROUTES.author) return false;
    const expected = item.href.split('tab=')[1];
    return tab === expected || (tab == null && expected === 'inbox' && item.id === 'inbox');
  }

  const target = item.href.split('?')[0];
  if (target === pathname) return true;
  if (item.id === 'memories' && pathname.startsWith('/dashboard/memories')) {
    return !pathname.startsWith('/dashboard/memories/mindmap');
  }
  if (item.id === 'memory-edit' && pathname.startsWith(DASHBOARD_ROUTES.memoryEditor)) {
    return true;
  }
  if (item.id === 'mindmap' && pathname.startsWith('/dashboard/memories/mindmap')) return true;
  if (item.id === 'replay' && pathname.startsWith(DASHBOARD_ROUTES.replay)) return true;
  if (item.id === 'byok' && pathname.startsWith(DASHBOARD_ROUTES.authorSettings)) {
    return section === 'byok';
  }
  if (item.id === 'settings' && pathname.startsWith(DASHBOARD_ROUTES.authorSettings)) {
    return section !== 'byok';
  }
  return false;
}

export function Sidebar({
  collapsed = false,
  density = 'comfortable',
  workspaceName,
  workspacePlanLabel,
  workspaceEntries,
  workspaceHasMore = false,
  userName,
  userPlanLabel,
  memoryHealth,
  badges = {},
  dots = {},
  onCommandPalette,
  activeAuthorTab,
  onAuthorTab,
}: SidebarProps) {
  const { t } = useDashboardTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = activeAuthorTab ?? searchParams?.get('tab') ?? null;
  const section = searchParams?.get('section') ?? null;

  const entriesLabel = t('dashboard.workspace.switcher.entries', { count: workspaceEntries });
  const searchLabel = t('dashboard.topBar.search');
  const metaLabel = t('dashboard.memoryHealth.factsCount', {
    relativeTime: formatRelative(memoryHealth.lastSyncedAt),
    count: memoryHealth.factsCount,
  });

  const groupNodes = NAV_GROUPS.map((group) => (
    <SidebarGroup key={group.id} label={t(group.labelKey)} collapsed={collapsed}>
      {group.items.map((item) => {
        const active = isItemActive(item, pathname, tab, section);
        const badgeRaw = item.badgeKey ? badges[item.badgeKey] : undefined;
        const badge = typeof badgeRaw === 'number' && badgeRaw <= 0 ? undefined : badgeRaw;
        const showDot = item.dotKey ? Boolean(dots[item.dotKey]) : false;
        return (
          <SidebarItem
            key={item.id}
            item={item}
            label={t(item.labelKey)}
            active={active}
            collapsed={collapsed}
            density={density}
            badge={badge}
            showDot={showDot}
            onAuthorTab={onAuthorTab}
          />
        );
      })}
    </SidebarGroup>
  ));

  return (
    <aside
      style={{
        width: collapsed ? 56 : 232,
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'width .2s ease',
      }}
      aria-label="Workspace navigation"
    >
      <WorkspaceSwitcher
        collapsed={collapsed}
        workspaceName={workspaceName}
        planLabel={workspacePlanLabel}
        entriesLabel={entriesLabel}
        hasMore={workspaceHasMore}
      />
      {!collapsed && (
        <div style={{ padding: '0 12px 4px' }}>
          <button
            type="button"
            onClick={onCommandPalette}
            aria-label={searchLabel}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              fontSize: 12.5,
              color: 'var(--text-muted)',
              cursor: 'text',
            }}
          >
            <span style={{ display: 'flex' }}>
              <SearchIcon size={14} />
            </span>
            <span style={{ flex: 1 }}>{searchLabel}</span>
            <Kbd style={{ fontSize: 9.5 }}>{'⌘K'}</Kbd>
          </button>
        </div>
      )}
      <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>{groupNodes}</nav>
      <MemoryHealth
        collapsed={collapsed}
        state={memoryHealth}
        syncedLabel={t('dashboard.memoryHealth.synced')}
        syncingLabel={t('dashboard.memoryHealth.syncing')}
        errorLabel={t('dashboard.memoryHealth.error')}
        metaLabel={metaLabel}
      />
      <UserCard collapsed={collapsed} name={userName} planLabel={userPlanLabel} />
    </aside>
  );
}

export type { NavBadgeMap, NavDotMap };
