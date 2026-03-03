"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Session } from "next-auth";
import type { NavGroup } from "./DashboardShell";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  navigationGroups: NavGroup[];
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
  navigationGroups,
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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] szn-card flex flex-col transform transition-transform duration-300 ease-out lg:hidden ${
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
              <span className="text-xl font-bold text-szn-text-1 block">
                Seizn<span className="theme-primary">.</span>
              </span>
              <p className="text-[10px] text-szn-text-3 flex items-center gap-1">
                {"Agent OS"} <span>{seasonConfig.icon}</span>
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-szn-text-3 hover:text-szn-text-1 hover:bg-szn-surface-2 rounded-xl transition-colors"
            aria-label="Close menu"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
          {navigationGroups.map((group, groupIdx) => (
            <div key={group.key || `group-${groupIdx}`}>
              {/* Group header (skip for empty-label top group) */}
              {group.key && (
                <>
                  {groupIdx > 0 && (
                    <div className="mx-3 my-2 border-t border-szn-border" />
                  )}
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-[10px] font-semibold tracking-widest text-szn-text-3 uppercase">
                      {group.label}
                    </span>
                  </div>
                </>
              )}

              {/* Group items */}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium transition-all duration-200 ${
                        active
                          ? "bg-szn-surface-2 text-szn-text-1"
                          : "text-szn-text-2 hover:bg-szn-surface-1 hover:text-szn-text-1 active:bg-szn-surface-2"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-szn-accent" />
                      )}
                      <item.icon
                        className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${
                          active
                            ? "text-szn-accent"
                            : "text-szn-text-3 group-hover:text-szn-text-2"
                        }`}
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t theme-border">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-szn-surface-1">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className="w-11 h-11 rounded-full ring-2 ring-white dark:ring-gray-700 shadow-md object-cover"
              />
            ) : (
              <div className="w-11 h-11 rounded-full theme-gradient-btn flex items-center justify-center shadow-md">
                <span className="text-white font-semibold text-base">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-szn-text-1 truncate">
                {session?.user?.name || "User"}
              </p>
              <p className="text-xs text-szn-text-2 truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3.5 min-h-[48px] rounded-xl text-sm font-medium text-szn-text-3 hover:text-szn-text-1 hover:bg-szn-surface-2 active:bg-szn-surface-2 transition-colors"
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
