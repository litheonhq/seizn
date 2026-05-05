import type { ComponentType } from 'react';
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
        href: '/dashboard/author?tab=inbox',
        icon: InboxIcon,
        badgeKey: 'inbox.unread',
        kbd: 'I',
      },
      {
        id: 'review',
        labelKey: 'dashboard.nav.review',
        href: '/dashboard/author?tab=review',
        icon: ReviewIcon,
        badgeKey: 'review.pending',
        kbd: 'R',
      },
      {
        id: 'characters',
        labelKey: 'dashboard.nav.characters',
        href: '/dashboard/author?tab=characters',
        icon: CharactersIcon,
        badgeKey: 'characters.count',
        kbd: 'C',
      },
      {
        id: 'graph',
        labelKey: 'dashboard.nav.graph',
        href: '/dashboard/author?tab=graph',
        icon: GraphIcon,
        kbd: 'G',
      },
      {
        id: 'timeline',
        labelKey: 'dashboard.nav.timeline',
        href: '/dashboard/author?tab=timeline',
        icon: TimelineIcon,
        kbd: 'T',
      },
      {
        id: 'conflicts',
        labelKey: 'dashboard.nav.conflicts',
        href: '/dashboard/author?tab=conflicts',
        icon: ConflictIcon,
        badgeKey: 'conflicts.open',
        dotKey: 'conflicts.has_p1',
        kbd: 'X',
      },
      {
        id: 'simulate',
        labelKey: 'dashboard.nav.simulate',
        href: '/dashboard/author?tab=simulate',
        icon: SimulateIcon,
        kbd: 'S',
      },
      {
        id: 'audit',
        labelKey: 'dashboard.nav.audit',
        href: '/dashboard/author?tab=audit',
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
        href: '/dashboard/memories',
        icon: BrainIcon,
      },
      {
        id: 'memory-edit',
        labelKey: 'dashboard.nav.memoryEditor',
        href: '/dashboard/memory-editor',
        icon: EditIcon,
      },
      {
        id: 'mindmap',
        labelKey: 'dashboard.nav.mindMap',
        href: '/dashboard/memories/mindmap',
        icon: MapIcon,
      },
      {
        id: 'replay',
        labelKey: 'dashboard.nav.replay',
        href: '/dashboard/replay',
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
        href: '/dashboard/usage',
        icon: UsageIcon,
      },
      {
        id: 'byok',
        labelKey: 'dashboard.nav.byok',
        href: '/dashboard/settings/byok',
        icon: ByokIcon,
      },
      {
        id: 'settings',
        labelKey: 'dashboard.nav.settings',
        href: '/dashboard/settings',
        icon: SettingsIcon,
      },
    ],
  },
];

export type NavBadgeMap = Partial<Record<string, number | string>>;
export type NavDotMap = Partial<Record<string, boolean>>;
