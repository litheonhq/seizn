"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { ThemeToggleSidebar } from "@/components/ui/ThemeToggle";
import MobileSidebar from "./MobileSidebar";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

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

const navigationConfig = [
  { key: "dashboard.overview", href: "/dashboard", icon: HomeIcon },
  { key: "dashboard.organizations", href: "/dashboard/organizations", icon: UsersIcon },
  { key: "dashboard.usage", href: "/dashboard/usage", icon: ChartIcon },
  { key: "dashboard.analytics", href: "/dashboard/analytics", icon: AnalyticsIcon },
  { key: "dashboard.apiKeys", href: "/dashboard/keys", icon: KeyIcon },
  { key: "dashboard.docs", href: "/docs", icon: BookIcon },
  { key: "dashboard.settings", href: "/dashboard/settings", icon: SettingsIcon },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useDashboardTranslation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      // Full page redirect to ensure no stale cache
      window.location.href = "/login";
    }
  }, [status]);

  // Handle sign out with cache invalidation
  const handleSignOut = async () => {
    // Clear any client-side cached data
    router.refresh();
    await signOut({ callbackUrl: "/", redirect: true });
  };
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [season, setSeason] = useState<Season>("winter");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/organizations");
      const data = await res.json();
      if (data.success && data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error("Failed to fetch orgs:", err);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrganizations();
    }
  }, [status, fetchOrganizations]);

  // Close dropdowns on outside click
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

  useEffect(() => {
    setSeason(getSeason());
  }, []);

  const config = seasonConfig[season];
  const isSidebarExpanded = isSidebarPinned;
  // Fixed sidebar padding - sidebar overlays instead of pushing content
  const mainPaddingClass = "lg:pl-20";
  const topBarHeight = "lg:pt-14";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Show loading or redirect if not authenticated
  if (status === "loading" || status === "unauthenticated") {
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
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 whitespace-nowrap">
                {config.icon} {config.name}
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navigationConfig.map((item) => {
            const active = isActive(item.href);
            const label = t(item.key);

            // When sidebar is collapsed, clicking icon toggles sidebar instead of navigating
            const handleClick = (e: React.MouseEvent) => {
              if (!isSidebarExpanded) {
                e.preventDefault();
                setIsSidebarPinned(true);
              }
            };

            return (
              <Link
                key={item.key}
                href={item.href}
                title={label}
                onClick={handleClick}
                className={`group flex items-center rounded-2xl text-sm font-medium transition-all duration-300 ease-out overflow-hidden ${
                  isSidebarExpanded ? "gap-3 px-4 py-3" : "justify-center p-3"
                } ${
                  active
                    ? "theme-gradient-btn text-white shadow-lg theme-shadow"
                    : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-white hover:shadow-md"
                }`}
              >
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    active ? "text-white" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                  }`}
                />
                <span className={`truncate whitespace-nowrap transition-all duration-300 ease-out ${
                  isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 w-0'
                }`}>{label}</span>
                {!isSidebarExpanded && <span className="sr-only">{label}</span>}
              </Link>
            );
          })}
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
                className={`rounded-full ring-2 ring-white shadow-md transition-all duration-300 ${
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
        navigationConfig={navigationConfig}
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
        {/* Org Selector */}
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

        {/* Create Button */}
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

// Icons
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z"
      />
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
      />
    </svg>
  );
}
