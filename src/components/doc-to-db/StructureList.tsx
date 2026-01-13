"use client";

import { useState, useEffect } from "react";
import { StructureViewer } from "./StructureViewer";
import type { DocumentStructure, StructureType, StructureCell } from "@/lib/doc-to-db/types";

// ============================================================
// Types
// ============================================================

interface StructureListProps {
  documentId?: string;
  collectionId?: string;
  onStructureSelect?: (structure: DocumentStructure) => void;
  onCellClick?: (cell: StructureCell, structure: DocumentStructure) => void;
  emptyMessage?: string;
  showFilters?: boolean;
  initialLimit?: number;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  structures: DocumentStructure[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// Main Component
// ============================================================

export function StructureList({
  documentId,
  collectionId,
  onStructureSelect,
  onCellClick,
  emptyMessage = "No structures found",
  showFilters = true,
  initialLimit = 10,
}: StructureListProps) {
  // State
  const [state, setState] = useState<FetchState>({
    loading: true,
    error: null,
    structures: [],
    pagination: { page: 1, perPage: initialLimit, total: 0, totalPages: 0 },
  });

  const [filters, setFilters] = useState({
    structureType: "" as StructureType | "",
    page: 1,
  });

  const [expandedStructure, setExpandedStructure] = useState<string | null>(null);
  const [structureCells, setStructureCells] = useState<Record<string, StructureCell[]>>({});

  // Fetch structures
  useEffect(() => {
    const fetchStructures = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const params = new URLSearchParams();
        if (documentId) params.set("document_id", documentId);
        if (collectionId) params.set("collection_id", collectionId);
        if (filters.structureType) params.set("structure_type", filters.structureType);
        params.set("page", filters.page.toString());
        params.set("per_page", initialLimit.toString());

        const response = await fetch(`/api/doc-to-db/structures?${params.toString()}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to fetch structures");
        }

        const data = await response.json();

        setState({
          loading: false,
          error: null,
          structures: data.data || [],
          pagination: data.pagination || {
            page: 1,
            perPage: initialLimit,
            total: 0,
            totalPages: 0,
          },
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "An error occurred",
        }));
      }
    };

    fetchStructures();
  }, [documentId, collectionId, filters, initialLimit]);

  // Fetch cells for expanded structure
  useEffect(() => {
    if (!expandedStructure || structureCells[expandedStructure]) return;

    const fetchCells = async () => {
      try {
        const response = await fetch(`/api/doc-to-db/structures/${expandedStructure}?include_cells=true`);

        if (response.ok) {
          const data = await response.json();
          setStructureCells((prev) => ({
            ...prev,
            [expandedStructure]: data.data?.cells || [],
          }));
        }
      } catch (err) {
        console.error("Failed to fetch cells:", err);
      }
    };

    fetchCells();
  }, [expandedStructure, structureCells]);

  // Handlers
  const handleFilterChange = (type: StructureType | "") => {
    setFilters({ structureType: type, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleStructureClick = (structure: DocumentStructure) => {
    if (onStructureSelect) {
      onStructureSelect(structure);
    } else {
      setExpandedStructure((prev) => (prev === structure.id ? null : structure.id || null));
    }
  };

  const handleCellClick = (cell: StructureCell) => {
    const structure = state.structures.find((s) => s.id === cell.structure_id);
    if (structure && onCellClick) {
      onCellClick(cell, structure);
    }
  };

  // Render loading state
  if (state.loading) {
    return (
      <div className="space-y-4">
        {showFilters && <FiltersSkeleton />}
        {Array.from({ length: 3 }).map((_, i) => (
          <StructureCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Render error state
  if (state.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <svg
          className="w-12 h-12 text-red-400 mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-red-700 font-medium">{state.error}</p>
        <button
          onClick={() => setFilters({ ...filters })}
          className="mt-3 px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Render empty state
  if (state.structures.length === 0) {
    return (
      <div className="space-y-4">
        {showFilters && (
          <StructureFilters value={filters.structureType} onChange={handleFilterChange} />
        )}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  // Render list
  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <StructureFilters value={filters.structureType} onChange={handleFilterChange} />
      )}

      {/* Structure cards */}
      <div className="space-y-4">
        {state.structures.map((structure) => {
          const isExpanded = expandedStructure === structure.id;
          const cells = structure.id ? structureCells[structure.id] : [];

          return (
            <div key={structure.id}>
              {/* Card header (clickable) */}
              <div
                className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                  isExpanded ? "rounded-b-none border-b-0" : ""
                }`}
                onClick={() => handleStructureClick(structure)}
              >
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StructureTypeIcon type={structure.structure_type} />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {structure.title || `Untitled ${structure.structure_type}`}
                      </h3>
                      {structure.description && (
                        <p className="text-sm text-gray-500 line-clamp-1">{structure.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                      {structure.row_count} x {structure.column_count}
                    </span>
                    <StructureTypeBadge type={structure.structure_type} />
                    <ChevronIcon expanded={isExpanded} />
                  </div>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="bg-white rounded-b-2xl border border-t-0 border-gray-200 shadow-sm">
                  <StructureViewer
                    structure={structure}
                    cells={cells}
                    onCellClick={handleCellClick}
                    showRawText
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {state.pagination.totalPages > 1 && (
        <Pagination
          currentPage={state.pagination.page}
          totalPages={state.pagination.totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StructureFilters({
  value,
  onChange,
}: {
  value: StructureType | "";
  onChange: (type: StructureType | "") => void;
}) {
  const types: { value: StructureType | ""; label: string }[] = [
    { value: "", label: "All Types" },
    { value: "table", label: "Tables" },
    { value: "list", label: "Lists" },
    { value: "key_value", label: "Key-Value" },
    { value: "hierarchy", label: "Hierarchy" },
    { value: "schema", label: "Schema" },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {types.map((type) => (
        <button
          key={type.value}
          onClick={() => onChange(type.value)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            value === type.value
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="px-4 py-2 text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================
// Skeleton Components
// ============================================================

function FiltersSkeleton() {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 w-20 bg-gray-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function StructureCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-6 w-16 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

// ============================================================
// Helper Components
// ============================================================

function StructureTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    table: (
      <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
    list: (
      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 6h16M4 10h16M4 14h16M4 18h16"
        />
      </svg>
    ),
    key_value: (
      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    hierarchy: (
      <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
      </svg>
    ),
    schema: (
      <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
        />
      </svg>
    ),
  };

  return <div className="p-2 bg-gray-50 rounded-xl">{icons[type] || icons.table}</div>;
}

function StructureTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    table: "bg-blue-100 text-blue-700",
    list: "bg-green-100 text-green-700",
    key_value: "bg-purple-100 text-purple-700",
    hierarchy: "bg-orange-100 text-orange-700",
    schema: "bg-cyan-100 text-cyan-700",
  };

  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${colors[type] || colors.table}`}>
      {type.replace("_", " ")}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default StructureList;
