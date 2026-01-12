"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

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
      router.push("/en/login");
    }
  }, [status, router]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [season, setSeason] = useState<Season>("winter");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);

  useEffect(() => {
    setSeason(getSeason());
  }, []);

  const config = seasonConfig[season];
  const isSidebarExpanded = isSidebarPinned;
  const mainPaddingClass = isSidebarExpanded ? "lg:pl-72" : "lg:pl-20";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Show loading or redirect if not authenticated
  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
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

      {/* Sidebar - Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden lg:flex lg:flex-col glass-card transition-[width] duration-300 ${
          isSidebarExpanded ? "w-72" : "w-20"
        }`}
        
        
      >
        {/* Logo */}
        <div className="p-4 border-b theme-border">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-10 h-10 rounded-2xl shadow-lg" />
            {isSidebarExpanded && (
              <div className="flex-1 min-w-0">
                <span className="text-xl font-bold text-gray-900 block truncate">
                  Seizn<span className="theme-primary">.</span>
                </span>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {config.icon} {config.name}
                </p>
              </div>
            )}
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
                className={`group flex items-center rounded-2xl text-sm font-medium transition-colors duration-200 ${
                  isSidebarExpanded ? "gap-3 px-4 py-3" : "justify-center p-3"
                } ${
                  active
                    ? "theme-gradient-btn text-white shadow-lg theme-shadow"
                    : "text-gray-600 hover:bg-white/60 hover:text-gray-900 hover:shadow-md"
                }`}
              >
                <item.icon
                  className={`w-5 h-5 transition-transform group-hover:scale-110 ${
                    active ? "text-white" : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
                {isSidebarExpanded ? (
                  <>
                    <span className="truncate">{label}</span>
                  </>
                ) : (
                  <span className="sr-only">{label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t theme-border">
          <div className={`flex items-center gap-3 p-3 rounded-2xl bg-white/50 ${isSidebarExpanded ? 'hover:bg-white/80' : 'justify-center'} transition-colors`}>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className="w-11 h-11 rounded-full ring-2 ring-white shadow-md"
              />
            ) : (
              <div className="w-11 h-11 rounded-full theme-gradient-btn flex items-center justify-center shadow-md">
                <span className="text-white font-semibold">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            {isSidebarExpanded && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {session?.user?.name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-xl transition-all duration-200"
                  title={t("dashboard.signOut")}
                >
                  <LogoutIcon className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 glass-card border-b theme-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-9 h-9 rounded-xl" />
            <span className="text-lg font-bold text-gray-900">Seizn</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.icon}</span>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-white/60 rounded-xl transition-colors"
            >
              {isMobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <nav className="px-4 pb-4 space-y-1 animate-fade-in">
            {navigationConfig.map((item) => {
              const active = isActive(item.href);
              const label = t(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "theme-gradient-btn text-white" : "text-gray-600 hover:bg-white/60"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {label}
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-white/60"
            >
              <LogoutIcon className="w-5 h-5" />
              {t("dashboard.signOut")}
            </button>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className={`pt-16 lg:pt-0 min-h-screen relative z-10 ${mainPaddingClass}`}>
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

