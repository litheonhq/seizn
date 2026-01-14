"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Session } from "next-auth";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  navigationConfig: {
    key: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  t: (key: string) => string;
  seasonConfig: {
    name: string;
    icon: string;
  };
  onSignOut: () => void;
}

export default function MobileSidebar({
  isOpen,
  onClose,
  session,
  navigationConfig,
  t,
  seasonConfig,
  onSignOut,
}: MobileSidebarProps) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Handle swipe to close
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || !isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      startXRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startXRef.current === null) return;
      const currentX = e.touches[0].clientX;
      const diff = startXRef.current - currentX;

      // If swiping left more than 50px, close the sidebar
      if (diff > 50) {
        onClose();
        startXRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      startXRef.current = null;
    };

    sidebar.addEventListener("touchstart", handleTouchStart);
    sidebar.addEventListener("touchmove", handleTouchMove);
    sidebar.addEventListener("touchend", handleTouchEnd);

    return () => {
      sidebar.removeEventListener("touchstart", handleTouchStart);
      sidebar.removeEventListener("touchmove", handleTouchMove);
      sidebar.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen, onClose]);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Drawer */}
      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] glass-card flex flex-col transform transition-transform duration-300 ease-out lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b theme-border">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/seizn-icon.svg"
              alt="Seizn"
              className="w-10 h-10 rounded-2xl shadow-lg"
            />
            <div>
              <span className="text-xl font-bold text-gray-900 block">
                Seizn<span className="theme-primary">.</span>
              </span>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {seasonConfig.icon} {seasonConfig.name}
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label={t("dashboard.close") || "Close menu"}
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigationConfig.map((item) => {
            const active = isActive(item.href);
            const label = t(item.key);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center gap-3 px-4 py-3.5 min-h-[48px] rounded-2xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "theme-gradient-btn text-white shadow-lg theme-shadow"
                    : "text-gray-600 hover:bg-white/60 hover:text-gray-900 active:bg-white/80"
                }`}
              >
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${
                    active
                      ? "text-white"
                      : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t theme-border">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/50">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className="w-11 h-11 rounded-full ring-2 ring-white shadow-md"
              />
            ) : (
              <div className="w-11 h-11 rounded-full theme-gradient-btn flex items-center justify-center shadow-md">
                <span className="text-white font-semibold text-base">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {session?.user?.name || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3.5 min-h-[48px] rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-white/60 active:bg-white/80 transition-colors"
          >
            <LogoutIcon className="w-5 h-5" />
            {t("dashboard.signOut")}
          </button>
        </div>
      </aside>
    </>
  );
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
      />
    </svg>
  );
}
