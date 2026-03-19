"use client";

import { useState } from "react";
import type { CellSearchResult, StructureSearchResult, CellDataType } from "@/lib/doc-to-db/types";

// ============================================================
// Types
// ============================================================

interface CellSearchResultsProps {
  results: CellSearchResult[];
  structureResults?: StructureSearchResult[];
  query: string;
  loading?: boolean;
  onCellClick?: (cell: CellSearchResult) => void;
  onStructureClick?: (structure: StructureSearchResult) => void;
  showStructureResults?: boolean;
}

// ============================================================
// Data Type Colors
// ============================================================

const dataTypeColors: Record<CellDataType, string> = {
  text: "bg-gray-100 text-gray-600",
  number: "bg-blue-100 text-blue-600",
  date: "bg-purple-100 text-purple-600",
  currency: "bg-green-100 text-green-600",
  percentage: "bg-orange-100 text-orange-600",
  boolean: "bg-rose-100 text-rose-600",
  email: "bg-cyan-100 text-cyan-600",
  url: "bg-indigo-100 text-indigo-600",
  phone: "bg-yellow-100 text-yellow-600",
  unknown: "bg-gray-100 text-gray-400",
};

// ============================================================
// Main Component
// ============================================================

export function CellSearchResults({
  results,
  structureResults = [],
  query,
  loading = false,
  onCellClick,
  onStructureClick,
  showStructureResults = true,
}: CellSearchResultsProps) {
  const [activeTab, setActiveTab] = useState<"cells" | "structures">("cells");

  // Loading state
  if (loading) {
    return <SearchResultsSkeleton />;
  }

  // Empty state
  if (results.length === 0 && structureResults.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
        <SearchEmptyIcon />
        <p className="text-gray-500 mt-4">No results found for &quot;{query}&quot;</p>
        <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      {showStructureResults && structureResults.length > 0 && (
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <TabButton
            active={activeTab === "cells"}
            onClick={() => setActiveTab("cells")}
            count={results.length}
            label="Cell Matches"
          />
          <TabButton
            active={activeTab === "structures"}
            onClick={() => setActiveTab("structures")}
            count={structureResults.length}
            label="Structure Matches"
          />
        </div>
      )}

      {/* Results */}
      {activeTab === "cells" ? (
        <CellResultsList results={results} query={query} onCellClick={onCellClick} />
      ) : (
        <StructureResultsList
          results={structureResults}
          query={query}
          onStructureClick={onStructureClick}
        />
      )}
    </div>
  );
}

// ============================================================
// Cell Results List
// ============================================================

function CellResultsList({
  results,
  query,
  onCellClick,
}: {
  results: CellSearchResult[];
  query: string;
  onCellClick?: (cell: CellSearchResult) => void;
}) {
  // Group results by structure
  const groupedResults = results.reduce((acc, result) => {
    const key = result.structure_id;
    if (!acc[key]) {
      acc[key] = {
        structureId: result.structure_id,
        structureTitle: result.structure_title,
        structureType: result.structure_type,
        cells: [],
      };
    }
    acc[key].cells.push(result);
    return acc;
  }, {} as Record<string, { structureId: string; structureTitle?: string; structureType: string; cells: CellSearchResult[] }>);

  return (
    <div className="space-y-4">
      {Object.values(groupedResults).map((group) => (
        <div
          key={group.structureId}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
        >
          {/* Structure header */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
            <StructureTypeIcon type={group.structureType} size="sm" />
            <span className="font-medium text-gray-900">
              {group.structureTitle || `Untitled ${group.structureType}`}
            </span>
            <span className="text-xs text-gray-400">
              {group.cells.length} match{group.cells.length !== 1 ? "es" : ""}
            </span>
          </div>

          {/* Cell matches */}
          <div className="divide-y divide-gray-100">
            {group.cells.map((cell) => (
              <CellResultItem
                key={cell.id}
                cell={cell}
                query={query}
                onClick={onCellClick ? () => onCellClick(cell) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CellResultItem({
  cell,
  query,
  onClick,
}: {
  cell: CellSearchResult;
  query: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`px-5 py-3 flex items-center gap-4 ${
        onClick ? "cursor-pointer hover:bg-gray-50" : ""
      }`}
      onClick={onClick}
    >
      {/* Position indicator */}
      <div className="flex-shrink-0 text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">
        [{cell.row_index}
        {cell.col_index !== undefined && `, ${cell.col_index}`}]
      </div>

      {/* Key (if present) */}
      {cell.cell_key && (
        <span className="flex-shrink-0 font-medium text-gray-700 min-w-[100px]">
          {cell.cell_key}:
        </span>
      )}

      {/* Value with highlighted query */}
      <span className="flex-1 text-gray-600">
        <HighlightedText text={cell.cell_value} query={query} />
      </span>

      {/* Data type badge */}
      <span
        className={`flex-shrink-0 px-2 py-0.5 rounded text-xs ${
          dataTypeColors[cell.data_type] || dataTypeColors.unknown
        }`}
      >
        {cell.data_type}
      </span>

      {/* Similarity score */}
      <SimilarityBadge score={cell.similarity} />
    </div>
  );
}

// ============================================================
// Structure Results List
// ============================================================

function StructureResultsList({
  results,
  query,
  onStructureClick,
}: {
  results: StructureSearchResult[];
  query: string;
  onStructureClick?: (structure: StructureSearchResult) => void;
}) {
  return (
    <div className="space-y-3">
      {results.map((structure) => (
        <div
          key={structure.id}
          className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-5 ${
            onStructureClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""
          }`}
          onClick={onStructureClick ? () => onStructureClick(structure) : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <StructureTypeIcon type={structure.structure_type} />
              <div>
                <h3 className="font-semibold text-gray-900">
                  {structure.title || `Untitled ${structure.structure_type}`}
                </h3>
                {structure.description && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    <HighlightedText text={structure.description} query={query} />
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                {structure.row_count} x {structure.column_count}
              </span>
              <SimilarityBadge score={structure.similarity} />
            </div>
          </div>

          {/* Preview of headers */}
          {structure.headers && structure.headers.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">Columns:</span>
              {structure.headers.slice(0, 5).map((header, i) => (
                <span
                  key={i}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                >
                  {header}
                </span>
              ))}
              {structure.headers.length > 5 && (
                <span className="text-xs text-gray-400">
                  +{structure.headers.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Helper Components
// ============================================================

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {label}
      <span
        className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
          active ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function SimilarityBadge({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const color =
    percentage >= 80
      ? "bg-green-100 text-green-700"
      : percentage >= 60
        ? "bg-yellow-100 text-yellow-700"
        : "bg-gray-100 text-gray-600";

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{percentage}%</span>;
}

function StructureTypeIcon({ type, size = "md" }: { type: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const containerClass = size === "sm" ? "p-1.5" : "p-2";

  const icons: Record<string, React.ReactNode> = {
    table: (
      <svg className={`${sizeClass} text-blue-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
    list: (
      <svg className={`${sizeClass} text-green-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 6h16M4 10h16M4 14h16M4 18h16"
        />
      </svg>
    ),
    key_value: (
      <svg className={`${sizeClass} text-purple-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    hierarchy: (
      <svg className={`${sizeClass} text-orange-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
      </svg>
    ),
    schema: (
      <svg className={`${sizeClass} text-cyan-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
        />
      </svg>
    ),
  };

  return (
    <div className={`${containerClass} bg-gray-50 rounded-xl flex-shrink-0`}>
      {icons[type] || icons.table}
    </div>
  );
}

function SearchEmptyIcon() {
  return (
    <svg
      className="w-16 h-16 text-gray-300 mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

// ============================================================
// Skeleton
// ============================================================

function SearchResultsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Tab skeleton */}
      <div className="h-10 w-64 bg-gray-200 rounded-xl animate-pulse" />

      {/* Result cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
        >
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="p-5 space-y-3">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="flex items-center gap-4">
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CellSearchResults;
