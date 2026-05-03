"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { ThemeToggleSidebar } from "@/components/ui/ThemeToggle";
import MobileSidebar from "./MobileSidebar";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import { ChevronDownIcon, LogoutIcon, MenuIcon } from "./dashboard-icons";
import {
  buildAuthorNavigationGroups, buildNavigationGroups, getSeason, seasonConfig,
  type NavGroup,
} from "./navigation";
import { SeiznMark } from "@/components/landing/brand-marks";

export type { NavItem, NavGroup } from "./navigation";

// =============================================================================
// Component
// =============================================================================

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useDashboardTranslation();
  const isAuthorSurface = pathname.startsWith("/dashboard/author")
    || pathname.startsWith("/dashboard/settings/author")
    || pathname.startsWith("/dashboard/settings/byok");
  const navigationGroups = useMemo(
    () => isAuthorSurface ? buildAuthorNavigationGroups(t) : buildNavigationGroups(t),
    [isAuthorSurface, t]
  );

  const handleSignOut = async () => {
    router.refresh();
    await signOut({ callbackUrl: "/", redirect: true });
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const season = getSeason();
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);

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

  // Command Palette keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const config = seasonConfig[season];
  const isSidebarExpanded = isSidebarPinned;
  const mainPaddingClass = "lg:pl-[68px]";
  const topBarHeight = "lg:pt-14";

  const isActive = useCallback((href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }, [pathname]);

  const allNavItems = navigationGroups.flatMap((g) => g.items);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--ink-50)]" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--ink-900)]"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div className={`theme-${season} min-h-screen bg-[var(--ink-50)]`}>
      {/* Skip to content */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--ink-900)] focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        {t("dashboard.skipToContent") || "Skip to content"}
      </a>

      {/* Sidebar Backdrop - Desktop */}
      {isSidebarExpanded && (
        <div
          className="fixed inset-0 z-40 hidden lg:block bg-black/20 transition-opacity duration-200"
          onClick={() => setIsSidebarPinned(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 hidden lg:flex lg:flex-col bg-[var(--ink-0)] border-r border-[var(--ink-200)] transition-[width] duration-200 ease-out ${
          isSidebarExpanded ? "w-72" : "w-[68px]"
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-[var(--ink-200)]">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <span
              aria-label="Seizn"
              className="w-8 h-8 rounded-lg flex-shrink-0 inline-flex items-center justify-center"
            >
              <SeiznMark size={28} color="var(--ink-900)" />
            </span>
            <div className={`flex-1 min-w-0 transition-all duration-200 ease-out ${
              isSidebarExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 w-0"
            }`}>
              <span className="text-sm font-semibold text-[var(--ink-900)] block truncate whitespace-nowrap">
                Seizn
              </span>
              <p className="text-[10px] text-[var(--ink-500)] flex items-center gap-1 whitespace-nowrap">
                {"NPC Memory"} <span>{config.icon}</span>
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation - Grouped */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-hidden szn-scroll-shadow-y">
          {isSidebarExpanded ? (
            <ExpandedNav
              groups={navigationGroups}
              openGroups={openGroups}
              autoExpandedGroupKeys={autoExpandedGroupKeys}
              toggleGroup={toggleGroup}
              isActive={isActive}
            />
          ) : (
            <CollapsedNav
              items={allNavItems}
              isActive={isActive}
              onExpand={() => setIsSidebarPinned(true)}
            />
          )}
        </nav>

        {/* Theme Toggle */}
        <div className="px-2 pb-2">
          <ThemeToggleSidebar expanded={isSidebarExpanded} />
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-[var(--ink-200)]">
          <div className={`flex items-center gap-2.5 p-2 rounded-lg ${isSidebarExpanded ? "hover:bg-[var(--ink-50)]" : "justify-center"} transition-colors duration-150`}>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className={`rounded-full object-cover ${
                  isSidebarExpanded ? "w-8 h-8" : "w-7 h-7"
                }`}
              />
            ) : (
              <div className={`rounded-full bg-[var(--ink-50)] flex items-center justify-center ${
                isSidebarExpanded ? "w-8 h-8" : "w-7 h-7"
              }`}>
                <span className="text-[var(--ink-600)] font-medium text-xs">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className={`flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out ${
              isSidebarExpanded ? "flex-1 opacity-100" : "w-0 opacity-0"
            }`}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--ink-900)] truncate whitespace-nowrap">
                  {session?.user?.name || "User"}
                </p>
                <p className="text-[11px] text-[var(--ink-500)] truncate whitespace-nowrap">{session?.user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-50)] rounded-md transition-colors duration-150 flex-shrink-0"
                title={t("dashboard.signOut")}
              >
                <LogoutIcon className="w-4 h-4" />
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
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 bg-[var(--ink-0)] border-b border-[var(--ink-200)]">
        <div className="flex items-center justify-between px-3 sm:px-4 min-h-[56px] sm:min-h-[60px]">
          <Link href="/" className="flex items-center gap-2 min-h-[44px]">
            <span
              aria-label="Seizn"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center"
            >
              <SeiznMark size={28} color="var(--ink-900)" />
            </span>
            <span className="text-sm sm:text-base font-semibold text-[var(--ink-900)]">Seizn</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-base sm:text-lg">{config.icon}</span>
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--ink-600)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-50)] rounded-md transition-colors"
              aria-label={t("dashboard.menu") || "Open menu"}
            >
              <MenuIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Top Bar */}
      <TopBar
        t={t}
        isAuthenticated={status === "authenticated"}
        onCommandPaletteOpen={() => setIsCommandPaletteOpen(true)}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        navigationGroups={navigationGroups}
        t={t}
      />

      {/* Main Content */}
      <main id="dashboard-main" className={`pt-14 sm:pt-16 ${topBarHeight} min-h-screen relative z-10 ${mainPaddingClass} min-w-[320px]`}>
        <div className="p-4 sm:p-6 lg:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ExpandedNav({
  groups,
  openGroups,
  autoExpandedGroupKeys,
  toggleGroup,
  isActive,
}: {
  groups: NavGroup[];
  openGroups: Record<string, boolean>;
  autoExpandedGroupKeys: Set<string>;
  toggleGroup: (key: string) => void;
  isActive: (href: string) => boolean;
}) {
  return (
    <>
      {groups.map((group) => {
        const isOpen = group.key
          ? (openGroups[group.key] ?? true) || autoExpandedGroupKeys.has(group.key)
          : true;
        return (
          <div key={group.key || "__top"} className={group.key ? "mt-0.5" : ""}>
            {group.key && (
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex items-center justify-between w-full px-3 pt-4 pb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--ink-500)]/70 uppercase hover:text-[var(--ink-600)] transition-colors duration-150"
              >
                <span>{group.label}</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ease-[cubic-bezier(0.165,0.84,0.44,1)] ${isOpen ? "rotate-180" : ""}`} />
              </button>
            )}
            {isOpen && (
              <div className="space-y-px">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium rounded-lg transition-all duration-150 overflow-hidden ${
                        active
                          ? "bg-[var(--ink-900)]/10 text-[var(--ink-900)]"
                          : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]/80 hover:text-[var(--ink-900)]"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-[var(--ink-900)]" />
                      )}
                      <item.icon
                        className={`w-[16px] h-[16px] flex-shrink-0 transition-colors duration-150 ${
                          active
                            ? "text-[var(--ink-900)]"
                            : "text-[var(--ink-500)] group-hover:text-[var(--ink-600)]"
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
      })}
    </>
  );
}

function CollapsedNav({
  items,
  isActive,
  onExpand,
}: {
  items: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  isActive: (href: string) => boolean;
  onExpand: () => void;
}) {
  return (
    <div className="space-y-px pt-1">
      {items.map((item) => {
        const active = isActive(item.href);
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          onExpand();
        };
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={handleClick}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center justify-center w-full h-9 rounded-lg transition-all duration-150 ${
              active
                ? "bg-[var(--ink-900)]/10"
                : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]/80"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-[var(--ink-900)]" />
            )}
            <item.icon
              className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-150 ${
                active
                  ? "text-[var(--ink-900)]"
                  : "text-[var(--ink-500)] group-hover:text-[var(--ink-600)]"
              }`}
            />
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
