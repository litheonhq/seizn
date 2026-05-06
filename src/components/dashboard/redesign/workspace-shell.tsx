'use client';

import { Newsreader } from 'next/font/google';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Sidebar } from './sidebar/sidebar';
import { TopBar, type TopBarTab } from './top-bar';
import type { Density } from './types';
import { CharactersView } from './views/characters-view';
import { ConflictsView } from './views/conflicts-view';
import { FallbackView } from './views/fallback-view';
import { GraphView } from './views/graph-view';
import { InboxView } from './views/inbox-view';
import { SimulateEmpty } from './views/simulate-empty';
import {
  useAuthorCharactersList,
  useAuthorConflictsList,
  useAuthorGraphData,
  useAuthorInbox,
  useAuthorProjectId,
  useAuthorUiHealth,
  useAuthorWorkspace,
} from './views/use-author-data';

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const VALID_TABS: TopBarTab[] = [
  'inbox',
  'review',
  'characters',
  'graph',
  'timeline',
  'conflicts',
  'simulate',
  'audit',
];

function isValidTab(value: string | null): value is TopBarTab {
  return value != null && (VALID_TABS as string[]).includes(value);
}

export interface WorkspaceShellProps {
  defaultTab?: TopBarTab;
  initialCollapsed?: boolean;
  density?: Density;
  userName: string;
  userPlanLabel: string;
}

export function WorkspaceShell({
  defaultTab = 'inbox',
  initialCollapsed = false,
  density = 'comfortable',
  userName,
  userPlanLabel,
}: WorkspaceShellProps) {
  const searchParams = useSearchParams();
  const { t } = useDashboardTranslation();

  const [tab, setTab] = useState<TopBarTab>(() => {
    const initial = searchParams?.get('tab') ?? null;
    return isValidTab(initial) ? initial : defaultTab;
  });
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const projectId = useAuthorProjectId();
  const workspace = useAuthorWorkspace();
  const inbox = useAuthorInbox(projectId);
  const characters = useAuthorCharactersList(projectId);
  const graph = useAuthorGraphData(projectId);
  const conflicts = useAuthorConflictsList(projectId);
  const memoryHealth = useAuthorUiHealth(projectId);

  const handleTabChange = useCallback(
    (next: TopBarTab) => {
      setTab(next);
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    },
    []
  );

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  const badges = useMemo(() => {
    const inboxUnread = inbox.data.filter((row) => row.unread).length;
    const conflictsOpen = conflicts.data.length;
    const charactersCount = characters.data.length;
    return {
      'inbox.unread': inboxUnread,
      'review.pending': inbox.data.filter((row) => row.kind === 'Review').length,
      'characters.count': charactersCount,
      'conflicts.open': conflictsOpen,
    };
  }, [inbox.data, conflicts.data, characters.data]);

  const dots = useMemo(
    () => ({
      'conflicts.has_p1': conflicts.data.some((c) => c.severity === 'P1'),
    }),
    [conflicts.data]
  );

  const workspaceName = workspace.data.workspaceName.startsWith('dashboard.')
    ? t(workspace.data.workspaceName)
    : workspace.data.workspaceName;

  const view = (() => {
    switch (tab) {
      case 'inbox':
        return <InboxView rows={inbox.data} />;
      case 'characters':
        return <CharactersView characters={characters.data} detail={characters.detail} />;
      case 'graph':
        return (
          <GraphView
            nodes={graph.data.nodes}
            edges={graph.data.edges}
            characters={characters.data}
          />
        );
      case 'conflicts':
        return <ConflictsView conflicts={conflicts.data} />;
      case 'simulate':
        return <SimulateEmpty />;
      default:
        return <FallbackView tab={tab} />;
    }
  })();

  return (
    <div
      className={`dashboard-redesign ${newsreader.variable}`}
      style={{
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <Sidebar
        collapsed={collapsed}
        density={density}
        workspaceName={workspaceName}
        workspacePlanLabel={workspace.data.planLabel}
        workspaceEntries={workspace.data.episodeCount}
        workspaceHasMore={workspace.data.hasMore ?? false}
        userName={userName}
        userPlanLabel={userPlanLabel}
        memoryHealth={memoryHealth.data}
        badges={badges}
        dots={dots}
        tab={tab}
        onSelect={handleTabChange}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar
          tab={tab}
          onTab={handleTabChange}
          density={density}
          workspaceLabel={workspaceName}
          onToggleSidebar={toggleSidebar}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>{view}</div>
      </div>
    </div>
  );
}
