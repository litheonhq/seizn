"use client";

import { useState, useCallback } from "react";
import type { NoteType, NoteStatus, PrivacyClass } from "@/lib/spring/memory-v3/types";

// ============================================
// Types
// ============================================

export interface FilterState {
  timeRange: [number, number];
  types: NoteType[];
  statuses: NoteStatus[];
  privacyClasses: PrivacyClass[];
  searchQuery: string;
}

interface MindMapFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClose: () => void;
  nodeCount: number;
  edgeCount: number;
}

// ============================================
// Icons
// ============================================

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
    />
  </svg>
);

const FilterIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
    />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// ============================================
// Filter Options
// ============================================

const noteTypes: { value: NoteType; label: string; color: string }[] = [
  { value: "fact", label: "Fact", color: "bg-blue-500" },
  { value: "preference", label: "Preference", color: "bg-purple-500" },
  { value: "instruction", label: "Instruction", color: "bg-orange-500" },
  { value: "episode", label: "Episode", color: "bg-green-500" },
  { value: "procedure", label: "Procedure", color: "bg-sky-500" },
  { value: "relationship", label: "Relationship", color: "bg-cyan-500" },
];

const noteStatuses: { value: NoteStatus; label: string; color: string }[] = [
  { value: "candidate", label: "Candidate", color: "bg-yellow-500" },
  { value: "active", label: "Active", color: "bg-green-500" },
  { value: "superseded", label: "Superseded", color: "bg-gray-400" },
  { value: "contradicted", label: "Contradicted", color: "bg-red-500" },
  { value: "deleted", label: "Deleted", color: "bg-gray-300" },
];

const privacyClasses: { value: PrivacyClass; label: string; icon: string }[] = [
  { value: "public", label: "Public", icon: "globe" },
  { value: "internal", label: "Internal", icon: "building" },
  { value: "confidential", label: "Confidential", icon: "shield" },
  { value: "restricted", label: "Restricted", icon: "lock" },
];

// ============================================
// Component
// ============================================

export function MindMapFilters({
  filters,
  onFiltersChange,
  onClose,
  nodeCount,
  edgeCount,
}: MindMapFiltersProps) {
  const [isExpanded, setIsExpanded] = useState({
    time: true,
    types: true,
    statuses: true,
    privacy: false,
  });

  // Toggle type filter
  const toggleType = useCallback(
    (type: NoteType) => {
      const newTypes = filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type];
      onFiltersChange({ ...filters, types: newTypes });
    },
    [filters, onFiltersChange]
  );

  // Toggle status filter
  const toggleStatus = useCallback(
    (status: NoteStatus) => {
      const newStatuses = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status];
      onFiltersChange({ ...filters, statuses: newStatuses });
    },
    [filters, onFiltersChange]
  );

  // Toggle privacy class filter
  const togglePrivacy = useCallback(
    (privacyClass: PrivacyClass) => {
      const newPrivacyClasses = filters.privacyClasses.includes(privacyClass)
        ? filters.privacyClasses.filter((p) => p !== privacyClass)
        : [...filters.privacyClasses, privacyClass];
      onFiltersChange({ ...filters, privacyClasses: newPrivacyClasses });
    },
    [filters, onFiltersChange]
  );

  // Update search query
  const updateSearch = useCallback(
    (query: string) => {
      onFiltersChange({ ...filters, searchQuery: query });
    },
    [filters, onFiltersChange]
  );

  // Update time range
  const updateTimeRange = useCallback(
    (range: [number, number]) => {
      onFiltersChange({ ...filters, timeRange: range });
    },
    [filters, onFiltersChange]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    onFiltersChange({
      timeRange: [0, 100],
      types: [],
      statuses: [],
      privacyClasses: [],
      searchQuery: "",
    });
  }, [onFiltersChange]);

  // Check if any filters are active
  const hasActiveFilters =
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.privacyClasses.length > 0 ||
    filters.searchQuery.length > 0 ||
    filters.timeRange[0] > 0 ||
    filters.timeRange[1] < 100;

  return (
    <div className="h-full bg-szn-card border border-szn-border rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-szn-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterIcon className="w-5 h-5 text-szn-text-2" />
          <h2 className="font-semibold text-szn-text-1">Filters</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-szn-surface-1 rounded-lg transition-colors"
        >
          <XIcon className="w-5 h-5 text-szn-text-2" />
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 bg-szn-bg border-b border-szn-border flex items-center gap-4 text-sm">
        <span className="text-szn-text-2">
          <span className="font-semibold text-szn-text-1">{nodeCount}</span> nodes
        </span>
        <span className="text-szn-text-3">|</span>
        <span className="text-szn-text-2">
          <span className="font-semibold text-szn-text-1">{edgeCount}</span> edges
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search */}
        <div>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-szn-text-3" />
            <input aria-label="Search query"
              type="text"
              value={filters.searchQuery}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search entities..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-szn-bg border border-szn-border rounded-lg focus:outline-none focus:ring-2 focus:ring-szn-accent text-szn-text-1 placeholder-szn-text-3"
            />
          </div>
        </div>

        {/* Time Range */}
        <div className="space-y-2">
          <button
            onClick={() => setIsExpanded((e) => ({ ...e, time: !e.time }))}
            className="w-full flex items-center justify-between text-sm font-medium text-szn-text-1"
          >
            <div className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4" />
              <span>Time Range</span>
            </div>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded.time ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExpanded.time && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-szn-text-2">
                <span>Recent</span>
                <span>30 days ago</span>
              </div>
              <input aria-label="Time range slider"
                type="range"
                min={0}
                max={100}
                value={filters.timeRange[1]}
                onChange={(e) =>
                  updateTimeRange([filters.timeRange[0], parseInt(e.target.value)])
                }
                className="w-full h-2 bg-szn-surface rounded-lg appearance-none cursor-pointer accent-szn-accent"
              />
              <div className="flex items-center justify-between text-xs text-szn-text-2">
                <span>{filters.timeRange[0]}%</span>
                <span>{filters.timeRange[1]}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Note Types */}
        <div className="space-y-2">
          <button
            onClick={() => setIsExpanded((e) => ({ ...e, types: !e.types }))}
            className="w-full flex items-center justify-between text-sm font-medium text-szn-text-1"
          >
            <span>Note Types</span>
            <div className="flex items-center gap-2">
              {filters.types.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-szn-accent/10 text-szn-accent rounded-full">
                  {filters.types.length}
                </span>
              )}
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded.types ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {isExpanded.types && (
            <div className="space-y-1 pt-2">
              {noteTypes.map((type) => (
                <label
                  key={type.value}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-szn-surface-1 cursor-pointer transition-colors"
                >
                  <input aria-label="Value"
                    type="checkbox"
                    checked={filters.types.includes(type.value)}
                    onChange={() => toggleType(type.value)}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                  <div className={`w-3 h-3 rounded-full ${type.color}`} />
                  <span className="text-sm text-szn-text-1">{type.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="space-y-2">
          <button
            onClick={() => setIsExpanded((e) => ({ ...e, statuses: !e.statuses }))}
            className="w-full flex items-center justify-between text-sm font-medium text-szn-text-1"
          >
            <span>Status</span>
            <div className="flex items-center gap-2">
              {filters.statuses.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-szn-accent/10 text-szn-accent rounded-full">
                  {filters.statuses.length}
                </span>
              )}
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded.statuses ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {isExpanded.statuses && (
            <div className="space-y-1 pt-2">
              {noteStatuses.map((status) => (
                <label
                  key={status.value}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-szn-surface-1 cursor-pointer transition-colors"
                >
                  <input aria-label="Value"
                    type="checkbox"
                    checked={filters.statuses.includes(status.value)}
                    onChange={() => toggleStatus(status.value)}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                  <div className={`w-3 h-3 rounded-full ${status.color}`} />
                  <span className="text-sm text-szn-text-1">{status.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Privacy Class */}
        <div className="space-y-2">
          <button
            onClick={() => setIsExpanded((e) => ({ ...e, privacy: !e.privacy }))}
            className="w-full flex items-center justify-between text-sm font-medium text-szn-text-1"
          >
            <span>Privacy Class</span>
            <div className="flex items-center gap-2">
              {filters.privacyClasses.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-szn-accent/10 text-szn-accent rounded-full">
                  {filters.privacyClasses.length}
                </span>
              )}
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded.privacy ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {isExpanded.privacy && (
            <div className="space-y-1 pt-2">
              {privacyClasses.map((privacy) => (
                <label
                  key={privacy.value}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-szn-surface-1 cursor-pointer transition-colors"
                >
                  <input aria-label="Value"
                    type="checkbox"
                    checked={filters.privacyClasses.includes(privacy.value)}
                    onChange={() => togglePrivacy(privacy.value)}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                  <span className="text-sm text-szn-text-1">{privacy.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer - Clear Filters */}
      {hasActiveFilters && (
        <div className="p-4 border-t border-szn-border">
          <button
            onClick={clearFilters}
            className="w-full px-4 py-2 text-sm text-szn-text-2 hover:text-szn-text-1 bg-szn-surface hover:bg-szn-surface-1 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <XIcon className="w-4 h-4" />
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default MindMapFilters;
