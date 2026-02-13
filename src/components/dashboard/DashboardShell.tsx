"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { ThemeToggleSidebar } from "@/components/ui/ThemeToggle";
import MobileSidebar from "./MobileSidebar";

// =============================================================================
// Types
// =============================================================================

interface Organization {
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

const seasonConfig = {
  spring: {
    name: "Spring",
    icon: "🌸",
    particles: Array.from({ length: 8 }, (_, i) => ({
      className: "animate-float-slow",
      delay: i * 0.5,
    })),
  },
  summer: {
    name: "Summer",
    icon: "🌊",
    particles: Array.from({ length: 6 }, (_, i) => ({
      className: "animate-wave",
      delay: i * 0.3,
    })),
  },
  autumn: {
    name: "Autumn",
    icon: "🍂",
    particles: Array.from({ length: 6 }, (_, i) => ({
      className: "animate-leaffall",
      delay: i * 2,
    })),
  },
  winter: {
    name: "Winter",
    icon: "❄️",
    particles: Array.from({ length: 10 }, (_, i) => ({
      className: "animate-snowfall",
      delay: i * 1,
    })),
  },
};

type Season = keyof typeof seasonConfig;

function getSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// =============================================================================
// Navigation Groups
// =============================================================================

function buildNavigationGroups(t: (key: string) => string): NavGroup[] {
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
        { label: t("dashboard.nav.settings"), href: "/dashboard/settings", icon: SettingsIcon },
      ],
    },
  ];
}

// =============================================================================
// Component
// =============================================================================

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useDashboardTranslation();
  const navigationGroups = useMemo(() => buildNavigationGroups(t), [t]);

  const handleSignOut = async () => {
    router.refresh();
    await signOut({ callbackUrl: "/", redirect: true });
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const season = getSeason();
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  // Group open/close state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of navigationGroups) {
      if (group.key) {
        initial[group.key] = group.defaultOpen ?? false;
      }
    }
    return initial;
  });

  const autoExpandedGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of navigationGroups) {
      if (!group.key) continue;
      const hasActive = group.items.some((item) => {
        if (item.href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(item.href);
      });
      if (hasActive) keys.add(group.key);
    }
    return keys;
  }, [navigationGroups, pathname]);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      let cancelled = false;

      fetch("/api/dashboard/organizations")
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.success && data.organizations) {
            setOrganizations(data.organizations);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Failed to fetch orgs:", err);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [status]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
      }
      if (createDropdownRef.current && !createDropdownRef.current.contains(e.target as Node)) {
        setShowCreateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const config = seasonConfig[season];
  const isSidebarExpanded = isSidebarPinned;
  const mainPaddingClass = "lg:pl-20";
  const topBarHeight = "lg:pt-14";

  const isActive = useCallback((href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }, [pathname]);

  const allNavItems = navigationGroups.flatMap((g) => g.items);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    );
  }

  return (
    <div className={`theme-${season} min-h-screen theme-gradient-bg`}>
      {/* Seasonal particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {config.particles.map((particle, i) => (
          <div
            key={i}
            className={`absolute w-3 h-3 rounded-full ${particle.className}`}
            style={{
              left: `${10 + (i * 12) % 80}%`,
              top: `${5 + (i * 7) % 30}%`,
              backgroundColor: "var(--theme-particle-color)",
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Sidebar Backdrop - Desktop */}
      {isSidebarExpanded && (
        <div
          className="fixed inset-0 z-40 hidden lg:block bg-black/20 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsSidebarPinned(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden lg:flex lg:flex-col glass-card transition-all duration-300 ease-out ${
          isSidebarExpanded ? "w-72" : "w-20"
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b theme-border">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-10 h-10 rounded-2xl shadow-lg flex-shrink-0" />
            <div className={`flex-1 min-w-0 transition-all duration-300 ease-out ${
              isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 w-0'
            }`}>
              <span className="text-xl font-bold text-gray-900 dark:text-white block truncate whitespace-nowrap">
                Seizn<span className="theme-primary">.</span>
              </span>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1 whitespace-nowrap">
                {"Agent OS"} <span>{config.icon}</span>
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation - Grouped */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto scrollbar-thin">
          {isSidebarExpanded ? (
            navigationGroups.map((group) => {
              const isOpen = group.key
                ? (openGroups[group.key] ?? true) || autoExpandedGroupKeys.has(group.key)
                : true;
              return (
                <div key={group.key || "__top"} className={group.key ? "mt-1" : ""}>
                  {group.key && (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex items-center justify-between w-full px-3 pt-4 pb-1.5 text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <span>{group.label}</span>
                      <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  )}
                  {isOpen && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`group relative flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-200 overflow-hidden ${
                              active
                                ? "bg-white/70 dark:bg-gray-800/70 text-gray-900 dark:text-white"
                                : "text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                            }`}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-[color:var(--theme-primary)]" />
                            )}
                            <item.icon
                              className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${
                                active
                                  ? "text-[color:var(--theme-primary)]"
                                  : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-1 pt-1">
              {allNavItems.map((item) => {
                const active = isActive(item.href);
                const handleClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  setIsSidebarPinned(true);
                };
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    onClick={handleClick}
                    className={`group relative flex items-center justify-center p-2.5 rounded-xl transition-all duration-200 ${
                      active
                        ? "bg-white/70 dark:bg-gray-800/70"
                        : "text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-[color:var(--theme-primary)]" />
                    )}
                    <item.icon
                      className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${
                        active
                          ? "text-[color:var(--theme-primary)]"
                          : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                      }`}
                    />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Theme Toggle */}
        <div className="px-3 pb-2">
          <ThemeToggleSidebar expanded={isSidebarExpanded} />
        </div>

        {/* User Profile */}
        <div className="p-4 border-t theme-border">
          <div className={`flex items-center gap-3 p-3 rounded-2xl bg-white/50 dark:bg-gray-800/50 ${isSidebarExpanded ? 'hover:bg-white/80 dark:hover:bg-gray-700/80' : 'justify-center'} transition-all duration-300`}>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className={`rounded-full ring-2 ring-white shadow-md transition-all duration-300 object-cover ${
                  isSidebarExpanded ? 'w-11 h-11' : 'w-8 h-8'
                }`}
              />
            ) : (
              <div className={`rounded-full theme-gradient-btn flex items-center justify-center shadow-md transition-all duration-300 ${
                isSidebarExpanded ? 'w-11 h-11' : 'w-8 h-8'
              }`}>
                <span className={`text-white font-semibold transition-all duration-300 ${
                  isSidebarExpanded ? 'text-base' : 'text-sm'
                }`}>
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ease-out ${
              isSidebarExpanded ? 'flex-1 opacity-100' : 'w-0 opacity-0'
            }`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate whitespace-nowrap">
                  {session?.user?.name || "User"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate whitespace-nowrap">{session?.user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 rounded-xl transition-all duration-200 flex-shrink-0"
                title={t("dashboard.signOut")}
              >
                <LogoutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        session={session}
        navigationGroups={navigationGroups}
        t={t}
        seasonConfig={config}
        onSignOut={handleSignOut}
      />

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 glass-card border-b theme-border">
        <div className="flex items-center justify-between px-3 sm:px-4 min-h-[56px] sm:min-h-[60px]">
          <Link href="/" className="flex items-center gap-2 min-h-[44px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-md" />
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Seizn</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-base sm:text-lg">{config.icon}</span>
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-700/60 active:bg-white/80 dark:active:bg-gray-700/80 rounded-xl transition-colors"
              aria-label={t("dashboard.menu") || "Open menu"}
            >
              <MenuIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Top Bar */}
      <header className={`hidden lg:flex fixed top-0 right-0 left-20 z-30 h-14 items-center justify-between px-6 glass-card border-b theme-border`}>
        <div ref={orgDropdownRef} className="relative">
          <button
            onClick={() => setShowOrgDropdown(!showOrgDropdown)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <OrgIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <span>{selectedOrg?.name || t("dashboard.topBar.personal")}</span>
            <ChevronDownIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </button>
          {showOrgDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 animate-fade-in">
              <button
                onClick={() => { setSelectedOrg(null); setShowOrgDropdown(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${!selectedOrg ? 'bg-teal-50 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <UserIcon className="w-4 h-4" />
                {t("dashboard.topBar.personal")}
              </button>
              {organizations.length > 0 && <div className="border-t border-gray-100 dark:border-gray-700 my-1" />}
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => { setSelectedOrg(org); setShowOrgDropdown(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedOrg?.id === org.id ? 'bg-teal-50 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300' : 'text-gray-700 dark:text-gray-300'}`}
                >
                  <OrgIcon className="w-4 h-4" />
                  {org.name}
                </button>
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              <Link
                href="/dashboard/organizations"
                onClick={() => setShowOrgDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <SettingsIcon className="w-4 h-4" />
                {t("dashboard.topBar.manageOrgs")}
              </Link>
            </div>
          )}
        </div>

        <div ref={createDropdownRef} className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl theme-gradient-btn text-white text-sm font-medium shadow-md hover:shadow-lg transition-all"
          >
            <PlusIcon className="w-4 h-4" />
            {t("dashboard.topBar.create")}
          </button>
          {showCreateDropdown && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 animate-fade-in">
              <Link
                href="/dashboard/keys"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <KeyIcon className="w-4 h-4 text-amber-500" />
                {t("dashboard.topBar.createApiKey")}
              </Link>
              <Link
                href="/dashboard/organizations"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <UsersIcon className="w-4 h-4 text-teal-500" />
                {t("dashboard.topBar.createOrg")}
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={`pt-14 sm:pt-16 ${topBarHeight} min-h-screen relative z-10 ${mainPaddingClass}`}>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

// =============================================================================
// Icons (existing)
// =============================================================================

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function OrgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function AnalyticsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

// =============================================================================
// Icons (new)
// =============================================================================

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
    </svg>
  );
}

function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m4.5-18v18m4.5-18v18m4.5-18v18M6 6.75h.008v.008H6V6.75zm0 3h.008v.008H6V9.75zm0 3h.008v.008H6v-.008zm0 3h.008v.008H6v-.008zm3-9h.008v.008H9V6.75zm0 3h.008v.008H9V9.75zm0 3h.008v.008H9v-.008zm0 3h.008v.008H9v-.008zm3-9h.008v.008H12V6.75zm0 3h.008v.008H12V9.75zm0 3h.008v.008H12v-.008zm3-3h.008v.008H15V9.75zm0 3h.008v.008H15v-.008z" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm3.75-2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v2.25a.75.75 0 01-.75.75H6.75A.75.75 0 016 9V6.75zM6 20.25h12a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
    </svg>
  );
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
    </svg>
  );
}

function WebhookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  );
}
