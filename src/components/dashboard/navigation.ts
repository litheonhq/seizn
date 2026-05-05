/**
 * Dashboard navigation configuration
 *
 * Season config, navigation groups, and shared types
 * used by DashboardShell, MobileSidebar, and CommandPalette.
 */

import {
  HomeIcon, BrainIcon, MapIcon, InboxIcon, TerminalIcon, PlayIcon,
  KeyIcon, PlugIcon, WebhookIcon, BookIcon, UsersIcon, SettingsIcon,
  ChartIcon, ShieldIcon, FileTextIcon, WalletIcon,
} from "./dashboard-icons";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  Clock3Icon,
  GitBranchIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  UserRoundIcon,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

// =============================================================================
// Season Config
// =============================================================================

export const seasonConfig = {
  spring: { name: "Spring", icon: "🌿" },
  summer: { name: "Summer", icon: "🌊" },
  autumn: { name: "Autumn", icon: "🍂" },
  winter: { name: "Winter", icon: "❄️" },
};

export type Season = keyof typeof seasonConfig;

export function getSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// =============================================================================
// Navigation Groups
// =============================================================================

export function buildNavigationGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      key: "",
      label: "",
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.overview"), href: "/dashboard", icon: HomeIcon },
      ],
    },
    {
      key: "memory",
      label: t("dashboard.nav.groups.memory"),
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.memories"), href: "/dashboard/memories", icon: BrainIcon },
        { label: t("dashboard.nav.memoryEditor"), href: "/dashboard/memory-editor", icon: FileTextIcon },
        { label: t('dashboard.nav.memory.author_memory'), href: '/dashboard/author', icon: BookIcon },
        { label: t("dashboard.nav.import"), href: "/dashboard/import", icon: InboxIcon },
        { label: t("dashboard.nav.mindMap"), href: "/dashboard/memories/mindmap", icon: MapIcon },
        { label: t("dashboard.nav.candidates"), href: "/dashboard/memories/candidates", icon: InboxIcon },
        { label: t("dashboard.nav.replay"), href: "/dashboard/replay", icon: TerminalIcon },
        { label: t("dashboard.nav.canon"), href: "/dashboard/legacy/canon", icon: ShieldIcon },
        { label: t("dashboard.nav.chaos"), href: "/dashboard/legacy/chaos", icon: PlayIcon },
        { label: t("dashboard.nav.storyHealth"), href: "/dashboard/legacy/story-health", icon: ChartIcon },
        { label: t("dashboard.nav.postMortem"), href: "/dashboard/legacy/post-mortem", icon: FileTextIcon },
        { label: t("dashboard.nav.branches"), href: "/dashboard/memories/branches", icon: TerminalIcon },
        { label: t("dashboard.nav.provenance"), href: "/dashboard/memories/provenance", icon: MapIcon },
      ],
    },
    {
      key: "build",
      label: t("dashboard.nav.groups.build"),
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.devTools"), href: "/dashboard/legacy/devtools", icon: TerminalIcon },
        { label: t("dashboard.nav.playground"), href: "/dashboard/legacy/playground", icon: PlayIcon },
        { label: t("dashboard.nav.apiKeys"), href: "/dashboard/keys", icon: KeyIcon },
      ],
    },
    {
      key: "integrate",
      label: t("dashboard.nav.groups.integrate"),
      defaultOpen: false,
      items: [
        { label: 'Billing', href: '/dashboard/billing', icon: WalletIcon },
        { label: t("dashboard.nav.usage"), href: "/dashboard/usage", icon: ChartIcon },
        { label: t("dashboard.nav.integrations"), href: "/dashboard/legacy/integrations", icon: PlugIcon },
        { label: t("dashboard.nav.webhooks"), href: "/dashboard/legacy/webhooks", icon: WebhookIcon },
        { label: t("dashboard.nav.docs"), href: "/docs", icon: BookIcon },
      ],
    },
    {
      key: "system",
      label: t("dashboard.nav.groups.system"),
      defaultOpen: false,
      items: [
        { label: t("dashboard.nav.organizations"), href: "/dashboard/legacy/organizations", icon: UsersIcon },
        { label: t("dashboard.nav.compliance"), href: "/dashboard/legacy/compliance", icon: ShieldIcon },
        { label: t("dashboard.nav.moderation"), href: "/dashboard/legacy/moderation", icon: ShieldIcon },
        { label: t('dashboard.nav.author.settings'), href: '/dashboard/author/settings', icon: SettingsIcon },
        { label: t("dashboard.nav.settings"), href: "/dashboard/settings", icon: SettingsIcon },
      ],
    },
  ];
}

export function buildAuthorNavigationGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      key: "",
      label: "",
      items: [
        { label: t("dashboard.nav.author.workspace"), href: "/dashboard/author", icon: BookIcon },
      ],
    },
    {
      key: "work",
      label: t("dashboard.nav.author.groups.work"),
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.author.inbox"), href: "/dashboard/author?tab=inbox", icon: FileTextIcon },
        { label: t("dashboard.nav.author.review"), href: "/dashboard/author?tab=review", icon: RefreshCwIcon },
        { label: t("dashboard.nav.author.characters"), href: "/dashboard/author?tab=characters", icon: UserRoundIcon },
        { label: t("dashboard.nav.author.graph"), href: "/dashboard/author?tab=graph", icon: GitBranchIcon },
        { label: t("dashboard.nav.author.timeline"), href: "/dashboard/author?tab=timeline", icon: Clock3Icon },
        { label: t("dashboard.nav.author.conflicts"), href: "/dashboard/author?tab=conflicts", icon: AlertTriangleIcon },
        { label: t("dashboard.nav.author.simulate"), href: "/dashboard/author?tab=simulate", icon: PlayIcon },
        { label: t("dashboard.nav.author.audit"), href: "/dashboard/author?tab=audit", icon: ScrollTextIcon },
      ],
    },
    {
      key: "account",
      label: t("dashboard.nav.author.groups.account"),
      defaultOpen: false,
      items: [
        { label: t("dashboard.nav.author.usage"), href: "/dashboard/usage", icon: BarChart3Icon },
        { label: t("dashboard.nav.author.byok"), href: "/dashboard/settings/byok", icon: KeyIcon },
        { label: t("dashboard.nav.author.settings"), href: "/dashboard/settings/author", icon: SettingsIcon },
      ],
    },
  ];
}
