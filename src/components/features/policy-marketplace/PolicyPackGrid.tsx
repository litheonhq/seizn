"use client";

import { useState, useMemo } from "react";
import { PolicyPackCard, type PolicyPack } from "./PolicyPackCard";

interface PolicyPackGridProps {
  packs: PolicyPack[];
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "governance", label: "Governance" },
  { value: "compliance", label: "Compliance" },
  { value: "security", label: "Security" },
  { value: "performance", label: "Performance" },
  { value: "custom", label: "Custom" },
] as const;

export function PolicyPackGrid({
  packs,
  onInstall,
  onUninstall,
}: PolicyPackGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showInstalled, setShowInstalled] = useState<"all" | "installed" | "available">("all");

  const filteredPacks = useMemo(() => {
    return packs.filter((pack) => {
      // Category filter
      if (selectedCategory !== "all" && pack.category !== selectedCategory) {
        return false;
      }

      // Installation filter
      if (showInstalled === "installed" && !pack.installed) return false;
      if (showInstalled === "available" && pack.installed) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          pack.name.toLowerCase().includes(q) ||
          pack.description.toLowerCase().includes(q) ||
          pack.tags.some((t) => t.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [packs, searchQuery, selectedCategory, showInstalled]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search policy packs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                selectedCategory === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Install filter */}
        <select
          value={showInstalled}
          onChange={(e) => setShowInstalled(e.target.value as typeof showInstalled)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Packs</option>
          <option value="installed">Installed</option>
          <option value="available">Available</option>
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {filteredPacks.length} policy pack{filteredPacks.length !== 1 && "s"} found
      </p>

      {/* Grid */}
      {filteredPacks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPacks.map((pack) => (
            <PolicyPackCard
              key={pack.id}
              pack={pack}
              onInstall={onInstall}
              onUninstall={onUninstall}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            No policy packs found
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search or filter criteria
          </p>
        </div>
      )}
    </div>
  );
}
