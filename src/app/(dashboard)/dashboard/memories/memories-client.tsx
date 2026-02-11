"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

// ============================================
// Types
// ============================================

interface Memory {
  id: string;
  content: string;
  memory_type: string;
  tags: string[];
  namespace: string;
  similarity?: number;
  created_at: string;
  updated_at?: string;
  importance?: number;
  source?: string;
  scope?: string;
  agent_id?: string;
}

interface MemoriesResponse {
  success: boolean;
  results: Memory[];
  count: number;
  total: number;
  offset: number;
  limit: number;
  mode?: string;
  cached?: boolean;
}

interface NamespaceInfo {
  name: string;
  count: number;
}

interface NamespacesResponse {
  success: boolean;
  data: {
    namespaces: NamespaceInfo[];
    total: number;
  };
}

type SortOption = "date_desc" | "date_asc" | "importance" | "relevance";

// ============================================
// Icons
// ============================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const BrainIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.129A12.007 12.007 0 0112 21a12.007 12.007 0 01-7.363-2.558l-.772-.129c-1.717-.293-2.299-2.379-1.067-3.611L5 14.5" />
  </svg>
);

const TagIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);

const FilterIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
  </svg>
);

const SortIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const LoadingSpinner = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const InboxIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);

// ============================================
// Helpers
// ============================================

function sortToApiParams(sort: SortOption): { sort: string; order: string } {
  switch (sort) {
    case "date_desc": return { sort: "created_at", order: "desc" };
    case "date_asc": return { sort: "created_at", order: "asc" };
    case "importance": return { sort: "importance", order: "desc" };
    case "relevance": return { sort: "created_at", order: "desc" }; // relevance only in search mode
    default: return { sort: "created_at", order: "desc" };
  }
}

// ============================================
// Component
// ============================================

export default function MemoriesClient() {
  const { t } = useDashboardTranslation();

  // State
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>("date_desc");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [offset, setOffset] = useState(0);

  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [namespace, setNamespace] = useState("default");
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);

  // Date range filters
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState("");

  const ITEMS_PER_PAGE = 20;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch namespaces on mount
  useEffect(() => {
    fetch("/api/v1/memories/namespaces")
      .then(res => res.json())
      .then((data: NamespacesResponse) => {
        if (data.success && data.data?.namespaces) {
          setNamespaces(data.data.namespaces);
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Fetch memories
  const fetchMemories = useCallback(async (resetOffset = true) => {
    setIsLoading(true);
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const params = new URLSearchParams();

      // Browse mode: no query param. Search mode: include query.
      if (debouncedQuery.trim()) {
        params.set("query", debouncedQuery.trim());
        params.set("mode", "auto");
        params.set("threshold", "0.0");
      }

      params.set("limit", String(ITEMS_PER_PAGE));
      params.set("offset", String(currentOffset));
      params.set("namespace", namespace);

      // Sort
      const { sort, order } = sortToApiParams(sortOption);
      params.set("sort", sort);
      params.set("order", order);

      // Filters
      if (selectedTags.length > 0) {
        params.set("tags", selectedTags.join(","));
      }
      if (selectedTypes.length === 1) {
        params.set("memory_type", selectedTypes[0]);
      }

      // Date filters
      if (afterDate) params.set("after", new Date(afterDate).toISOString());
      if (beforeDate) params.set("before", new Date(beforeDate + "T23:59:59").toISOString());

      const res = await fetch(`/api/v1/memories?${params.toString()}`);
      const data: { success: boolean; data: MemoriesResponse } = await res.json();

      if (data.success) {
        const responseData = data.data;
        const newMemories = responseData.results || [];

        if (resetOffset) {
          setMemories(newMemories);
          setOffset(ITEMS_PER_PAGE);
        } else {
          setMemories(prev => [...prev, ...newMemories]);
          setOffset(currentOffset + ITEMS_PER_PAGE);
        }

        setTotalCount(responseData.total ?? responseData.count ?? newMemories.length);
        setHasMore(newMemories.length === ITEMS_PER_PAGE);
      }
    } catch (error) {
      console.error("Failed to fetch memories:", error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, selectedTags, selectedTypes, namespace, sortOption, afterDate, beforeDate, offset]);

  // Reset & fetch on filter/sort changes
  useEffect(() => {
    fetchMemories(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedTags, selectedTypes, namespace, sortOption, afterDate, beforeDate]);

  // Load more
  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchMemories(false);
    }
  };

  // Extract unique tags from memories
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    memories.forEach(m => {
      m.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [memories]);

  // Memory types
  const memoryTypes = ["fact", "preference", "experience", "relationship", "instruction"];

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Toggle memory type selection
  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get memory type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case "fact": return "bg-blue-100 text-blue-700";
      case "preference": return "bg-purple-100 text-purple-700";
      case "experience": return "bg-green-100 text-green-700";
      case "relationship": return "bg-orange-100 text-orange-700";
      case "instruction": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedTypes([]);
    setSearchQuery("");
    setAfterDate("");
    setBeforeDate("");
  };

  const hasActiveFilters = selectedTags.length > 0 || selectedTypes.length > 0 || searchQuery.length > 0 || afterDate || beforeDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
              <BrainIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t("dashboard.memoriesPage.title") || "Memories"}
              </h1>
              <p className="text-gray-500">
                {t("dashboard.memoriesPage.subtitle") || "Browse and search your AI memories"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            <p className="text-sm text-gray-500">{t("dashboard.memoriesPage.totalMemories") || "Total Memories"}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Filters */}
        <div className="lg:col-span-1 space-y-4">
          {/* Search */}
          <div className="glass-card rounded-2xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <SearchIcon className="w-4 h-4 inline mr-1" />
              {t("dashboard.memoriesPage.search") || "Search"}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("dashboard.memoriesPage.searchPlaceholder") || "Search memories..."}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Namespace */}
          <div className="glass-card rounded-2xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("dashboard.memoriesPage.namespace") || "Namespace"}
            </label>
            {namespaces.length > 0 ? (
              <select
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {namespaces.map((ns) => (
                  <option key={ns.name} value={ns.name}>
                    {ns.name} ({ns.count})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="default"
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}
          </div>

          {/* Date Range */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {t("dashboard.memoriesPage.dateRange") || "Date Range"}
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t("dashboard.memoriesPage.after") || "After"}
                </label>
                <input
                  type="date"
                  value={afterDate}
                  onChange={(e) => setAfterDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t("dashboard.memoriesPage.before") || "Before"}
                </label>
                <input
                  type="date"
                  value={beforeDate}
                  onChange={(e) => setBeforeDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Memory Types */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FilterIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {t("dashboard.memoriesPage.memoryTypes") || "Memory Types"}
              </span>
            </div>
            <div className="space-y-2">
              {memoryTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                  />
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeColor(type)}`}>
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TagIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {t("dashboard.memoriesPage.tags") || "Tags"}
              </span>
            </div>
            {allTags.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-teal-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {t("dashboard.memoriesPage.noTags") || "No tags available"}
              </p>
            )}
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <XIcon className="w-4 h-4" />
              {t("dashboard.memoriesPage.clearFilters") || "Clear Filters"}
            </button>
          )}
        </div>

        {/* Main Content - Memory List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Sort & Info Bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {t("dashboard.memoriesPage.showing") || "Showing"} {memories.length} {t("dashboard.memoriesPage.of") || "of"} {totalCount} {t("dashboard.memoriesPage.results") || "results"}
            </p>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <SortIcon className="w-4 h-4 text-gray-500" />
                <span>
                  {sortOption === "date_desc" && (t("dashboard.memoriesPage.sortNewest") || "Newest First")}
                  {sortOption === "date_asc" && (t("dashboard.memoriesPage.sortOldest") || "Oldest First")}
                  {sortOption === "importance" && (t("dashboard.memoriesPage.sortImportance") || "Most Important")}
                  {sortOption === "relevance" && (t("dashboard.memoriesPage.sortRelevance") || "Most Relevant")}
                </span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showSortDropdown ? "rotate-180" : ""}`} />
              </button>

              {showSortDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                  {([
                    ["date_desc", t("dashboard.memoriesPage.sortNewest") || "Newest First"],
                    ["date_asc", t("dashboard.memoriesPage.sortOldest") || "Oldest First"],
                    ["importance", t("dashboard.memoriesPage.sortImportance") || "Most Important"],
                    ...(debouncedQuery ? [["relevance", t("dashboard.memoriesPage.sortRelevance") || "Most Relevant"]] : []),
                  ] as [SortOption, string][]).map(([value, label], i, arr) => (
                    <button
                      key={value}
                      onClick={() => { setSortOption(value); setShowSortDropdown(false); }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                        i === 0 ? "rounded-t-xl" : ""
                      } ${i === arr.length - 1 ? "rounded-b-xl" : ""} ${
                        sortOption === value ? "text-teal-600 font-medium" : "text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{t("dashboard.memoriesPage.activeFilters") || "Active filters"}:</span>
              {selectedTypes.map(type => (
                <span key={type} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${getTypeColor(type)}`}>
                  {type}
                  <button onClick={() => toggleType(type)} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedTags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-teal-100 text-teal-700 rounded-full">
                  {tag}
                  <button onClick={() => toggleTag(tag)} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                  &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {afterDate && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-cyan-100 text-cyan-700 rounded-full">
                  After {afterDate}
                  <button onClick={() => setAfterDate("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {beforeDate && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-cyan-100 text-cyan-700 rounded-full">
                  Before {beforeDate}
                  <button onClick={() => setBeforeDate("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Memory Cards */}
          {isLoading && memories.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <LoadingSpinner className="w-8 h-8 text-teal-500 mx-auto" />
              <p className="mt-4 text-gray-500">{t("dashboard.memoriesPage.loading") || "Loading memories..."}</p>
            </div>
          ) : memories.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <InboxIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">
                {t("dashboard.memoriesPage.noMemories") || "No memories found"}
              </h3>
              <p className="text-gray-400">
                {hasActiveFilters
                  ? (t("dashboard.memoriesPage.noMatchingMemories") || "Try adjusting your filters or search query")
                  : (t("dashboard.memoriesPage.noMemoriesHint") || "Start adding memories via the API to see them here")
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="glass-card rounded-2xl p-4 hover:border-teal-200 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Content */}
                      <p className="text-gray-900 mb-3 whitespace-pre-wrap">
                        {memory.content}
                      </p>

                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {/* Memory Type */}
                        <span className={`px-2 py-0.5 rounded-full ${getTypeColor(memory.memory_type)}`}>
                          {memory.memory_type}
                        </span>

                        {/* Importance */}
                        {memory.importance != null && memory.importance !== 5 && (
                          <span className="flex items-center gap-0.5 text-amber-600">
                            <StarIcon className="w-3 h-3" />
                            {memory.importance}
                          </span>
                        )}

                        {/* Source */}
                        {memory.source && memory.source !== "api" && (
                          <span className="text-gray-400">
                            via {memory.source}
                          </span>
                        )}

                        {/* Tags */}
                        {memory.tags && memory.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <TagIcon className="w-3 h-3 text-gray-400" />
                            {memory.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-gray-500">
                                {tag}
                              </span>
                            ))}
                            {memory.tags.length > 3 && (
                              <span className="text-gray-400">+{memory.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Date */}
                        <span className="flex items-center gap-1 text-gray-400">
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(memory.created_at)}
                        </span>

                        {/* Similarity Score */}
                        {memory.similarity !== undefined && memory.similarity > 0 && (
                          <span className="text-teal-600">
                            {(memory.similarity * 100).toFixed(1)}% {t("dashboard.memoriesPage.match") || "match"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && memories.length > 0 && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    {t("dashboard.memoriesPage.loading") || "Loading..."}
                  </>
                ) : (
                  t("dashboard.memoriesPage.loadMore") || "Load More"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
