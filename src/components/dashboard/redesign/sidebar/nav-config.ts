import type { ComponentType } from 'react';
import { DASHBOARD_ROUTES, authorTabHref } from '@/lib/dashboard-routes';
import {
  AuditIcon,
  BrainIcon,
  ByokIcon,
  CharactersIcon,
  ConflictIcon,
  EditIcon,
  FeatherIcon,
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
  | 'overview'
  | 'inbox'
  | 'review'
  | 'characters'
  | 'graph'
  | 'timeline'
  | 'conflicts'
  | 'coach'
  | 'simulate'
  | 'audit'
  | 'memories'
  | 'memory-edit'
  | 'mindmap'
  | 'replay'
  | 'usage'
  | 'api-keys'
  | 'byok'
  | 'billing'
  | 'settings'
  | 'admin-metrics';

export type NavGroupId = 'work' | 'memory' | 'developer' | 'account' | 'admin';

export type NavCapability = 'track2' | 'admin' | 'billing';

export interface NavItem {
  id: NavItemId;
  labelKey: string;
  href: string;
  icon: ComponentType<IconProps>;
  badgeKey?: string;
  dotKey?: string;
  kbd?: string;
  requiredCapability?: NavCapability;
  secondary?: boolean;
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    labelKey: 'dashboard.nav.groups.work',
    items: [
      {
        id: 'overview',
        labelKey: 'dashboard.nav.overview',
        href: DASHBOARD_ROUTES.root,
        icon: BrainIcon,
      },
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
        id: 'coach',
        labelKey: 'dashboard.nav.coach',
        href: authorTabHref('coach'),
        icon: FeatherIcon,
        kbd: 'O',
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
        secondary: true,
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
        href: DASHBOARD_ROUTES.memories,
        icon: BrainIcon,
      },
      {
        id: 'memory-edit',
        labelKey: 'dashboard.nav.memoryEditor',
        href: DASHBOARD_ROUTES.memoryEditor,
        icon: EditIcon,
        secondary: true,
      },
      {
        id: 'mindmap',
        labelKey: 'dashboard.nav.mindMap',
        href: DASHBOARD_ROUTES.mindmap,
        icon: MapIcon,
        secondary: true,
      },
      {
        id: 'replay',
        labelKey: 'dashboard.nav.replay',
        href: DASHBOARD_ROUTES.replay,
        icon: ReplayIcon,
        secondary: true,
      },
    ],
  },
  {
    id: 'developer',
    labelKey: 'dashboard.nav.groups.developer',
    items: [
      {
        id: 'api-keys',
        labelKey: 'dashboard.nav.apiKeys',
        href: DASHBOARD_ROUTES.apiKeys,
        icon: ByokIcon,
      },
      {
        id: 'usage',
        labelKey: 'dashboard.nav.usage',
        href: authorTabHref('usage'),
        icon: UsageIcon,
      },
    ],
  },
  {
    id: 'account',
    labelKey: 'dashboard.nav.groups.account',
    items: [
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
      {
        id: 'billing',
        labelKey: 'dashboard.nav.billing',
        href: DASHBOARD_ROUTES.billing,
        icon: UsageIcon,
        requiredCapability: 'billing',
      },
    ],
  },
  {
    id: 'admin',
    labelKey: 'dashboard.nav.groups.admin',
    items: [
      {
        id: 'admin-metrics',
        labelKey: 'dashboard.nav.adminMetrics',
        href: '/en/admin/metrics',
        icon: AuditIcon,
        requiredCapability: 'admin',
      },
    ],
  },
];

export type NavBadgeMap = Partial<Record<string, number | string>>;
export type NavDotMap = Partial<Record<string, boolean>>;

export type NavCapabilityMap = Partial<Record<NavCapability, boolean>>;

export function filterNavGroupsByCapability(
  groups: readonly NavGroup[],
  capabilities: NavCapabilityMap = {}
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.requiredCapability) return true;
        return capabilities[item.requiredCapability] === true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
