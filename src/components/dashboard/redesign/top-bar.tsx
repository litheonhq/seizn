'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Kbd } from './atoms';
import {
  BellIcon,
  ChevronRightIcon,
  CommandIcon,
  FeatherIcon,
  PanelIcon,
} from './icons';
import type { Density } from './types';

export type TopBarVariant = 'A' | 'B';

export type TopBarTab =
  | 'inbox'
  | 'review'
  | 'characters'
  | 'graph'
  | 'timeline'
  | 'conflicts'
  | 'simulate'
  | 'audit';

export interface TopBarProps {
  variant?: TopBarVariant;
  tab: TopBarTab;
  onTab?: (tab: TopBarTab) => void;
  density?: Density;
  workspaceLabel?: string;
  onToggleSidebar?: () => void;
  onCommand?: () => void;
  onNotifications?: () => void;
  onWrite?: () => void;
}

const VARIANT_B_TABS: { id: TopBarTab; labelKey: string }[] = [
  { id: 'inbox', labelKey: 'dashboard.nav.inbox' },
  { id: 'characters', labelKey: 'dashboard.nav.characters' },
  { id: 'graph', labelKey: 'dashboard.nav.graph' },
  { id: 'conflicts', labelKey: 'dashboard.nav.conflicts' },
  { id: 'timeline', labelKey: 'dashboard.nav.timeline' },
];

const TAB_LABEL_KEYS: Record<TopBarTab, string> = {
  inbox: 'dashboard.nav.inbox',
  review: 'dashboard.nav.review',
  characters: 'dashboard.nav.characters',
  graph: 'dashboard.nav.graph',
  timeline: 'dashboard.nav.timeline',
  conflicts: 'dashboard.nav.conflicts',
  simulate: 'dashboard.nav.simulate',
  audit: 'dashboard.nav.audit',
};

const ICON_BTN_STYLE = {
  all: 'unset',
  cursor: 'pointer',
  width: 32,
  height: 32,
  borderRadius: 7,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-tertiary)',
} as const;

export function TopBar({
  variant = 'A',
  tab,
  onTab,
  density = 'comfortable',
  workspaceLabel,
  onToggleSidebar,
  onCommand,
  onNotifications,
  onWrite,
}: TopBarProps) {
  const { t } = useDashboardTranslation();
  const showTabs = variant === 'B';
  const height = density === 'compact' ? 48 : density === 'spacious' ? 60 : 54;

  const breadcrumbWorkspace = workspaceLabel ?? t('dashboard.topBar.workspace');
  const breadcrumbTabLabel = t(TAB_LABEL_KEYS[tab] ?? 'dashboard.topBar.workspace');

  return (
    <header
      style={{
        height,
        flexShrink: 0,
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 14,
      }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={t('dashboard.topBar.toggleSidebar')}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 6,
          color: 'var(--text-tertiary)',
          display: 'flex',
        }}
      >
        <PanelIcon size={18} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{breadcrumbWorkspace}</span>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }} aria-hidden="true">
          <ChevronRightIcon size={14} />
        </span>
        <span
          className="serif"
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary)',
            fontStyle: 'italic',
            letterSpacing: '-0.018em',
          }}
        >
          {breadcrumbTabLabel}
        </span>
      </div>

      {showTabs && (
        <nav
          aria-label="Workspace tabs"
          style={{ display: 'flex', gap: 2, marginLeft: 12, height: '100%' }}
        >
          {VARIANT_B_TABS.map((entry) => {
            const isActive = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onTab?.(entry.id)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '0 10px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  borderBottom: `2px solid ${
                    isActive ? 'var(--terracotta-500)' : 'transparent'
                  }`,
                }}
              >
                {t(entry.labelKey)}
              </button>
            );
          })}
        </nav>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={onCommand}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            borderRadius: 7,
            border: '1px solid var(--border-subtle)',
            background: 'var(--ink-25)',
          }}
          aria-label={t('dashboard.topBar.command')}
        >
          <span style={{ display: 'flex' }} aria-hidden="true">
            <CommandIcon size={14} />
          </span>
          <span>{t('dashboard.topBar.command')}</span>
          <Kbd>{'⌘K'}</Kbd>
        </button>
        <button
          type="button"
          onClick={onNotifications}
          aria-label={t('dashboard.topBar.notifications')}
          style={ICON_BTN_STYLE}
        >
          <BellIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onWrite}
          aria-label={t('dashboard.topBar.write')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            marginLeft: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--terracotta-500)',
            color: '#ffffff',
            fontSize: 12.5,
            fontWeight: 600,
            borderRadius: 7,
            boxShadow: '0 1px 2px rgba(201, 100, 66, 0.25)',
          }}
        >
          <span style={{ display: 'flex' }} aria-hidden="true">
            <FeatherIcon size={14} />
          </span>
          <span>{t('dashboard.topBar.write')}</span>
        </button>
      </div>
    </header>
  );
}

export const ICON_BTN_TOPBAR = ICON_BTN_STYLE;
