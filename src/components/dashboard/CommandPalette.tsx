"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "./dashboard-icons";
import type { NavGroup } from "./navigation";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  navigationGroups: NavGroup[];
  t: (key: string) => string;
}

export default function CommandPalette({ isOpen, onClose, navigationGroups, t }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const allItems = navigationGroups.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.label }))
  );

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
          if (filtered.length === 0) return;
          setActiveIndex((prev) => {
            if (prev < 0 || prev >= filtered.length - 1) return 0;
            return prev + 1;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closePalette}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={t("dashboard.commandPalette.title") || "Command palette"}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <SearchIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t("dashboard.commandPalette.placeholder") || "Search pages..."}
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none text-sm"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
                    <div key={item.href}>
                      {showHeader && (
                        <div className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">
                          {item.group}
                        </div>
                      )}
                      <button
                        data-active={idx === activeIndex}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          idx === safeActiveIndex
                            ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <item.icon className={`w-4 h-4 flex-shrink-0 ${
                          idx === safeActiveIndex
                            ? "text-teal-500 dark:text-teal-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`} />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {idx === safeActiveIndex && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
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
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 font-mono">&#8593;</kbd>
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 font-mono">&#8595;</kbd>
            {t("dashboard.commandPalette.navigate") || "Navigate"}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 font-mono">&#9166;</kbd>
            {t("dashboard.commandPalette.open") || "Open"}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 font-mono">Esc</kbd>
            {t("dashboard.commandPalette.close") || "Close"}
          </span>
        </div>
      </div>
    </div>
  );
}
