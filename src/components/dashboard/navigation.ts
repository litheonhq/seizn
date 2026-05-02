/**
 * Dashboard navigation configuration
 *
 * Season config, navigation groups, and shared types
 * used by DashboardShell, MobileSidebar, and CommandPalette.
 */

import {
  HomeIcon, BrainIcon, MapIcon, InboxIcon, TerminalIcon, PlayIcon,
  FlaskIcon, AnalyticsIcon, ShieldIcon, LockIcon, ShieldCheckIcon,
  BuildingIcon, ChartIcon, WalletIcon, FileTextIcon, CalculatorIcon,
  KeyIcon, PlugIcon, WebhookIcon, BookIcon, UsersIcon, SettingsIcon,
} from "./dashboard-icons";

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
        { label: "Author Memory", href: "/dashboard/author", icon: BookIcon },
        { label: t("dashboard.nav.mindMap"), href: "/dashboard/memories/mindmap", icon: MapIcon },
        { label: t("dashboard.nav.candidates"), href: "/dashboard/memories/candidates", icon: InboxIcon },
      ],
    },
    {
      key: "observe",
      label: t("dashboard.nav.groups.observe"),
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.devTools"), href: "/dashboard/devtools", icon: TerminalIcon },
        { label: t("dashboard.nav.playground"), href: "/dashboard/playground", icon: PlayIcon },
        { label: t("dashboard.nav.evals"), href: "/dashboard/evals", icon: FlaskIcon },
        { label: t("dashboard.nav.analytics"), href: "/dashboard/analytics", icon: AnalyticsIcon },
      ],
    },
    {
      key: "govern",
      label: t("dashboard.nav.groups.govern"),
      defaultOpen: true,
      items: [
        { label: t("dashboard.nav.governance"), href: "/dashboard/governance", icon: ShieldIcon },
        { label: t("dashboard.nav.privacy"), href: "/dashboard/privacy", icon: LockIcon },
        { label: t("dashboard.nav.security"), href: "/dashboard/security", icon: ShieldCheckIcon },
        { label: t("dashboard.nav.enterprise"), href: "/dashboard/enterprise", icon: BuildingIcon },
      ],
    },
    {
      key: "finops",
      label: t("dashboard.nav.groups.finops"),
      defaultOpen: false,
      items: [
        { label: "Billing", href: "/dashboard/billing", icon: WalletIcon },
        { label: t("dashboard.nav.usage"), href: "/dashboard/usage", icon: ChartIcon },
        { label: t("dashboard.nav.budget"), href: "/dashboard/budget", icon: WalletIcon },
        { label: t("dashboard.nav.reports"), href: "/dashboard/reports", icon: FileTextIcon },
        { label: t("dashboard.nav.calculator"), href: "/dashboard/calculator", icon: CalculatorIcon },
      ],
    },
    {
      key: "connect",
      label: t("dashboard.nav.groups.connect"),
      defaultOpen: false,
      items: [
        { label: t("dashboard.nav.apiKeys"), href: "/dashboard/keys", icon: KeyIcon },
        { label: t("dashboard.nav.integrations"), href: "/dashboard/integrations", icon: PlugIcon },
        { label: t("dashboard.nav.webhooks"), href: "/dashboard/webhooks", icon: WebhookIcon },
        { label: t("dashboard.nav.docs"), href: "/docs", icon: BookIcon },
      ],
    },
    {
      key: "system",
      label: t("dashboard.nav.groups.system"),
      defaultOpen: false,
      items: [
        { label: t("dashboard.nav.organizations"), href: "/dashboard/organizations", icon: UsersIcon },
        { label: "Author Settings", href: "/dashboard/author/settings", icon: SettingsIcon },
        { label: t("dashboard.nav.settings"), href: "/dashboard/settings", icon: SettingsIcon },
      ],
    },
  ];
}
