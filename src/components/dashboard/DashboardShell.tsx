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
  buildNavigationGroups, getSeason, seasonConfig,
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
  const navigationGroups = useMemo(() => buildNavigationGroups(t), [t]);

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
      <div className="min-h-screen flex items-center justify-center bg-szn-bg" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-szn-text-1"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div className={`theme-${season} min-h-screen bg-szn-bg`}>
      {/* Skip to content */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-szn-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
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
        className={`fixed inset-y-0 left-0 z-50 hidden lg:flex lg:flex-col bg-szn-card border-r border-szn-border transition-[width] duration-200 ease-out ${
          isSidebarExpanded ? "w-72" : "w-[68px]"
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-szn-border">
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
              <span className="text-sm font-semibold text-szn-text-1 block truncate whitespace-nowrap">
                Seizn
              </span>
              <p className="text-[10px] text-szn-text-3 flex items-center gap-1 whitespace-nowrap">
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
        <div className="p-3 border-t border-szn-border">
          <div className={`flex items-center gap-2.5 p-2 rounded-lg ${isSidebarExpanded ? "hover:bg-szn-surface-1" : "justify-center"} transition-colors duration-150`}>
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
              <div className={`rounded-full bg-szn-surface flex items-center justify-center ${
                isSidebarExpanded ? "w-8 h-8" : "w-7 h-7"
              }`}>
                <span className="text-szn-text-2 font-medium text-xs">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className={`flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out ${
              isSidebarExpanded ? "flex-1 opacity-100" : "w-0 opacity-0"
            }`}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-szn-text-1 truncate whitespace-nowrap">
                  {session?.user?.name || "User"}
                </p>
                <p className="text-[11px] text-szn-text-3 truncate whitespace-nowrap">{session?.user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-szn-text-3 hover:text-szn-text-1 hover:bg-szn-surface-1 rounded-md transition-colors duration-150 flex-shrink-0"
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
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 bg-szn-card border-b border-szn-border">
        <div className="flex items-center justify-between px-3 sm:px-4 min-h-[56px] sm:min-h-[60px]">
          <Link href="/" className="flex items-center gap-2 min-h-[44px]">
            <span
              aria-label="Seizn"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center"
            >
              <SeiznMark size={28} color="var(--ink-900)" />
            </span>
            <span className="text-sm sm:text-base font-semibold text-szn-text-1">Seizn</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-base sm:text-lg">{config.icon}</span>
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-szn-text-2 hover:text-szn-text-1 hover:bg-szn-surface-1 rounded-md transition-colors"
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
                className="flex items-center justify-between w-full px-3 pt-4 pb-1 text-[10px] font-semibold tracking-[0.08em] text-szn-text-3/70 uppercase hover:text-szn-text-2 transition-colors duration-150"
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
                          ? "bg-szn-accent/10 text-szn-text-1"
                          : "text-szn-text-2 hover:bg-szn-surface-1/80 hover:text-szn-text-1"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-szn-accent" />
                      )}
                      <item.icon
                        className={`w-[16px] h-[16px] flex-shrink-0 transition-colors duration-150 ${
                          active
                            ? "text-szn-accent"
                            : "text-szn-text-3 group-hover:text-szn-text-2"
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
                ? "bg-szn-accent/10"
                : "text-szn-text-2 hover:bg-szn-surface-1/80"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-szn-accent" />
            )}
            <item.icon
              className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-150 ${
                active
                  ? "text-szn-accent"
                  : "text-szn-text-3 group-hover:text-szn-text-2"
              }`}
            />
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
