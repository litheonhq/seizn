"use client";

import { useState, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type {
  GraphFilter,
  GraphMetadata,
  GraphNodeType,
  GraphEdgeType,
  NodeStatus,
  PermissionLevel,
} from "@/lib/winter/graph/types";

// ============================================
// Types
// ============================================

export interface GraphControlsProps {
  filter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
  graphMetadata: GraphMetadata;
}

// ============================================
// Filter Options
// ============================================

const nodeTypeOptions: { value: GraphNodeType; label: string }[] = [
  { value: "user", label: "Users" },
  { value: "role", label: "Roles" },
  { value: "group", label: "Groups" },
  { value: "collection", label: "Collections" },
  { value: "document", label: "Documents" },
  { value: "chunk", label: "Chunks" },
  { value: "source", label: "Sources" },
  { value: "policy", label: "Policies" },
  { value: "organization", label: "Organizations" },
  { value: "service", label: "Services" },
];

const edgeTypeOptions: { value: GraphEdgeType; label: string }[] = [
  { value: "permission", label: "Permissions" },
  { value: "membership", label: "Memberships" },
  { value: "inheritance", label: "Inheritance" },
  { value: "reference", label: "References" },
  { value: "dependency", label: "Dependencies" },
  { value: "federation", label: "Federation" },
  { value: "data_flow", label: "Data Flow" },
];

const statusOptions: { value: NodeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "pending", label: "Pending" },
  { value: "error", label: "Error" },
  { value: "syncing", label: "Syncing" },
];

const permissionOptions: { value: PermissionLevel; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "write", label: "Write" },
  { value: "read", label: "Read" },
  { value: "none", label: "None" },
];

// ============================================
// GraphControls Component
// ============================================

export function GraphControls({
  filter,
  onFilterChange,
  graphMetadata,
}: GraphControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchValue, setSearchValue] = useState(filter.search || "");
  const reactFlowInstance = useReactFlow();

  // Handle search change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      onFilterChange({ ...filter, search: value || undefined });
    },
    [filter, onFilterChange]
  );

  // Handle multi-select filter change
  const handleMultiSelect = useCallback(
    <T extends string>(
      key: keyof GraphFilter,
      value: T,
      currentValues: T[] = []
    ) => {
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];

      onFilterChange({
        ...filter,
        [key]: newValues.length > 0 ? newValues : undefined,
      });
    },
    [filter, onFilterChange]
  );

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchValue("");
    onFilterChange({});
  }, [onFilterChange]);

  // Fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
  }, [reactFlowInstance]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn({ duration: 200 });
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut({ duration: 200 });
  }, [reactFlowInstance]);

  // Check if any filters are active
  const hasActiveFilters =
    searchValue ||
    (filter.nodeTypes && filter.nodeTypes.length > 0) ||
    (filter.edgeTypes && filter.edgeTypes.length > 0) ||
    (filter.status && filter.status.length > 0) ||
    (filter.permissionLevels && filter.permissionLevels.length > 0);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {graphMetadata.name}
          </h3>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={isExpanded ? "Collapse filters" : "Expand filters"}
          >
            <ChevronIcon
              className={`w-4 h-4 text-gray-500 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Search */}
        <div className="mt-2 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input aria-label="Search nodes..."
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search nodes..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Expandable Filters */}
      {isExpanded && (
        <div className="p-3 space-y-4 max-h-96 overflow-y-auto">
          {/* Node Types */}
          <FilterSection title="Node Types">
            <div className="flex flex-wrap gap-1">
              {nodeTypeOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={filter.nodeTypes?.includes(option.value) || false}
                  onClick={() =>
                    handleMultiSelect(
                      "nodeTypes",
                      option.value,
                      filter.nodeTypes as GraphNodeType[]
                    )
                  }
                />
              ))}
            </div>
          </FilterSection>

          {/* Edge Types */}
          <FilterSection title="Edge Types">
            <div className="flex flex-wrap gap-1">
              {edgeTypeOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={filter.edgeTypes?.includes(option.value) || false}
                  onClick={() =>
                    handleMultiSelect(
                      "edgeTypes",
                      option.value,
                      filter.edgeTypes as GraphEdgeType[]
                    )
                  }
                />
              ))}
            </div>
          </FilterSection>

          {/* Status */}
          <FilterSection title="Status">
            <div className="flex flex-wrap gap-1">
              {statusOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={filter.status?.includes(option.value) || false}
                  onClick={() =>
                    handleMultiSelect(
                      "status",
                      option.value,
                      filter.status as NodeStatus[]
                    )
                  }
                />
              ))}
            </div>
          </FilterSection>

          {/* Permission Levels */}
          <FilterSection title="Permission Levels">
            <div className="flex flex-wrap gap-1">
              {permissionOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={
                    filter.permissionLevels?.includes(option.value) || false
                  }
                  onClick={() =>
                    handleMultiSelect(
                      "permissionLevels",
                      option.value,
                      filter.permissionLevels as PermissionLevel[]
                    )
                  }
                />
              ))}
            </div>
          </FilterSection>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="w-full py-2 text-sm text-[var(--signal-conflict-ink)] hover:bg-[var(--signal-conflict-soft)] rounded-lg transition-colors"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* View Controls */}
      <div className="p-2 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <ControlButton onClick={handleZoomIn} title="Zoom In">
            <ZoomInIcon className="w-4 h-4" />
          </ControlButton>
          <ControlButton onClick={handleZoomOut} title="Zoom Out">
            <ZoomOutIcon className="w-4 h-4" />
          </ControlButton>
          <ControlButton onClick={handleFitView} title="Fit View">
            <FitIcon className="w-4 h-4" />
          </ControlButton>
        </div>

        {/* Active Filter Indicator */}
        {hasActiveFilters && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
            Filters Active
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-2 py-1 text-xs rounded-md transition-colors
        ${
          selected
            ? "bg-blue-100 text-blue-700 border border-blue-300"
            : "bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200"
        }
      `}
    >
      {label}
    </button>
  );
}

function ControlButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
    >
      {children}
    </button>
  );
}

// ============================================
// Icons
// ============================================

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function ZoomInIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
      />
    </svg>
  );
}

function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"
      />
    </svg>
  );
}

function FitIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
      />
    </svg>
  );
}

export default GraphControls;
