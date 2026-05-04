"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { InboxIcon, MapIcon, PlusIcon, SearchIcon } from "./dashboard-icons";
import type { NavGroup } from "./navigation";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  navigationGroups: NavGroup[];
  t: (key: string) => string;
}

type CommandPaletteItem = NavGroup["items"][number] & { group: string };

const EXCLUDED_COMMAND_ROUTES = new Set([
  "/dashboard/analytics",
  "/dashboard/autopilot",
  "/dashboard/budget",
  "/dashboard/calculator",
  "/dashboard/enterprise",
  "/dashboard/evals",
  "/dashboard/federated",
  "/dashboard/governance",
  "/dashboard/policy-marketplace",
  "/dashboard/privacy",
  "/dashboard/reports",
  "/dashboard/reranker",
  "/dashboard/security",
]);

export default function CommandPalette({ isOpen, onClose, navigationGroups, t }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const workflowGroup = t("dashboard.commandPalette.workflowGroup") || "NPC workflows";
  const workflowItems: CommandPaletteItem[] = [
    {
      label: t("dashboard.commandPalette.commands.createEntity") || "Create entity",
      href: "/dashboard/memories",
      icon: PlusIcon,
      group: workflowGroup,
    },
    {
      label: t("dashboard.commandPalette.commands.viewRelationGraph") || "View relation graph",
      href: "/dashboard/memories/mindmap",
      icon: MapIcon,
      group: workflowGroup,
    },
    {
      label: t("dashboard.commandPalette.commands.openEventInbox") || "Open event inbox",
      href: "/dashboard/memories/candidates",
      icon: InboxIcon,
      group: workflowGroup,
    },
  ];
  const navigationItems = navigationGroups.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.label }))
  ).filter((item) => !EXCLUDED_COMMAND_ROUTES.has(item.href));
  const allItems = [...workflowItems, ...navigationItems];

  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase()) ||
        item.group.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;
  const safeActiveIndex =
    filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  const closePalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  const navigate = useCallback(
    (href: string) => {
      setQuery("");
      setActiveIndex(0);
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setIsKeyboardNav(true);
          if (filtered.length === 0) return;
          setActiveIndex((prev) => {
            if (prev < 0 || prev >= filtered.length - 1) return 0;
            return prev + 1;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setIsKeyboardNav(true);
          if (filtered.length === 0) return;
          setActiveIndex((prev) => {
            if (prev <= 0 || prev >= filtered.length) return filtered.length - 1;
            return prev - 1;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (filtered.length === 0) return;
          if (safeActiveIndex >= 0 && filtered[safeActiveIndex]) {
            navigate(filtered[safeActiveIndex].href);
          }
          break;
        case "Escape":
          e.preventDefault();
          closePalette();
          break;
      }
    },
    [filtered, closePalette, navigate, safeActiveIndex]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={closePalette}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg mx-4 bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] overflow-hidden animate-scale-in" style={{ boxShadow: "var(--szn-shadow-modal)" }}
        role="dialog"
        aria-modal="true"
        aria-label={t("dashboard.commandPalette.title") || "Command palette"}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ink-200)]">
          <SearchIcon className="w-5 h-5 text-[var(--ink-500)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t("dashboard.commandPalette.placeholder") || "Search pages..."}
            className="flex-1 bg-transparent text-[var(--ink-900)] placeholder-[var(--ink-500)] outline-none text-sm"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--ink-50)] text-[var(--ink-500)] rounded border border-[var(--ink-200)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 szn-scroll-shadow-y">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-500)]">
              {t("dashboard.commandPalette.noResults") || "No results found"}
            </div>
          ) : (
            <>
              {/* Group results by group label */}
              {(() => {
                let currentGroup = "";
                return filtered.map((item, idx) => {
                  const showHeader = item.group !== currentGroup && item.group;
                  currentGroup = item.group;
                  return (
                    <div key={`${item.group}:${item.href}:${item.label}`}>
                      {showHeader && (
                        <div className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-[var(--ink-500)] uppercase">
                          {item.group}
                        </div>
                      )}
                      <button
                        data-active={idx === activeIndex}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => { setIsKeyboardNav(false); setActiveIndex(idx); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          idx === safeActiveIndex
                            ? `bg-[var(--ink-900)]/10 text-[var(--ink-900)]${isKeyboardNav ? " ring-2 ring-[var(--ink-900)] ring-inset" : ""}`
                            : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                        }`}
                      >
                        <item.icon className={`w-4 h-4 flex-shrink-0 ${
                          idx === safeActiveIndex
                            ? "text-[var(--ink-900)]"
                            : "text-[var(--ink-500)]"
                        }`} />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {idx === safeActiveIndex && (
                          <span className="text-[10px] text-[var(--ink-500)]">
                            {t("dashboard.commandPalette.enter") || "Enter"}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--ink-200)] text-[10px] text-[var(--ink-500)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--ink-50)] rounded border border-[var(--ink-200)] font-mono">&#8593;</kbd>
            <kbd className="px-1 py-0.5 bg-[var(--ink-50)] rounded border border-[var(--ink-200)] font-mono">&#8595;</kbd>
            {t("dashboard.commandPalette.navigate") || "Navigate"}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--ink-50)] rounded border border-[var(--ink-200)] font-mono">&#9166;</kbd>
            {t("dashboard.commandPalette.open") || "Open"}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--ink-50)] rounded border border-[var(--ink-200)] font-mono">Esc</kbd>
            {t("dashboard.commandPalette.close") || "Close"}
          </span>
        </div>
      </div>
    </div>
  );
}
