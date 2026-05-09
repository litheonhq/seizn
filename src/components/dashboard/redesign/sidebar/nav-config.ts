import type { ComponentType } from 'react';
import { DASHBOARD_ROUTES, authorTabHref } from '@/lib/dashboard-routes';
import {
  AuditIcon,
  BrainIcon,
  ByokIcon,
  CharactersIcon,
  ConflictIcon,
  EditIcon,
  GraphIcon,
  type IconProps,
  InboxIcon,
  MapIcon,
  ReplayIcon,
  ReviewIcon,
  SettingsIcon,
  SimulateIcon,
  TimelineIcon,
  UsageIcon,
} from '../icons';

export type NavItemId =
  | 'inbox'
  | 'review'
  | 'characters'
  | 'graph'
  | 'timeline'
  | 'conflicts'
  | 'simulate'
  | 'audit'
  | 'memories'
  | 'memory-edit'
  | 'mindmap'
  | 'replay'
  | 'usage'
  | 'byok'
  | 'settings';

export type NavGroupId = 'workspace' | 'memory' | 'account';

export interface NavItem {
  id: NavItemId;
  labelKey: string;
  href: string;
  icon: ComponentType<IconProps>;
  badgeKey?: string;
  dotKey?: string;
  kbd?: string;
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workspace',
    labelKey: 'dashboard.nav.groups.workspace',
    items: [
      {
        id: 'inbox',
        labelKey: 'dashboard.nav.inbox',
        href: authorTabHref('inbox'),
        icon: InboxIcon,
        badgeKey: 'inbox.unread',
        kbd: 'I',
      },
      {
        id: 'review',
        labelKey: 'dashboard.nav.review',
        href: authorTabHref('review'),
        icon: ReviewIcon,
        badgeKey: 'review.pending',
        kbd: 'R',
      },
      {
        id: 'characters',
        labelKey: 'dashboard.nav.characters',
        href: authorTabHref('characters'),
        icon: CharactersIcon,
        badgeKey: 'characters.count',
        kbd: 'C',
      },
      {
        id: 'graph',
        labelKey: 'dashboard.nav.graph',
        href: authorTabHref('graph'),
        icon: GraphIcon,
        kbd: 'G',
      },
      {
        id: 'timeline',
        labelKey: 'dashboard.nav.timeline',
        href: authorTabHref('timeline'),
        icon: TimelineIcon,
        kbd: 'T',
      },
      {
        id: 'conflicts',
        labelKey: 'dashboard.nav.conflicts',
        href: authorTabHref('conflicts'),
        icon: ConflictIcon,
        badgeKey: 'conflicts.open',
        dotKey: 'conflicts.has_p1',
        kbd: 'X',
      },
      {
        id: 'simulate',
        labelKey: 'dashboard.nav.simulate',
        href: authorTabHref('simulate'),
        icon: SimulateIcon,
        kbd: 'S',
      },
      {
        id: 'audit',
        labelKey: 'dashboard.nav.audit',
        href: authorTabHref('audit'),
        icon: AuditIcon,
        kbd: 'A',
      },
    ],
  },
  {
    id: 'memory',
    labelKey: 'dashboard.nav.groups.memory',
    items: [
      {
        id: 'memories',
        labelKey: 'dashboard.nav.memories',
        href: authorTabHref('memories'),
        icon: BrainIcon,
      },
      {
        id: 'memory-edit',
        labelKey: 'dashboard.nav.memoryEditor',
        href: authorTabHref('memory-edit'),
        icon: EditIcon,
      },
      {
        id: 'mindmap',
        labelKey: 'dashboard.nav.mindMap',
        href: authorTabHref('mindmap'),
        icon: MapIcon,
      },
      {
        id: 'replay',
        labelKey: 'dashboard.nav.replay',
        href: authorTabHref('replay'),
        icon: ReplayIcon,
      },
    ],
  },
  {
    id: 'account',
    labelKey: 'dashboard.nav.groups.account',
    items: [
      {
        id: 'usage',
        labelKey: 'dashboard.nav.usage',
        href: DASHBOARD_ROUTES.authorUsage,
        icon: UsageIcon,
      },
      {
        id: 'byok',
        labelKey: 'dashboard.nav.byok',
        href: DASHBOARD_ROUTES.authorSettingsByok,
        icon: ByokIcon,
      },
      {
        id: 'settings',
        labelKey: 'dashboard.nav.settings',
        href: DASHBOARD_ROUTES.authorSettings,
        icon: SettingsIcon,
      },
    ],
  },
];

export type NavBadgeMap = Partial<Record<string, number | string>>;
export type NavDotMap = Partial<Record<string, boolean>>;
