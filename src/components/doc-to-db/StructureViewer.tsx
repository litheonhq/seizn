"use client";

import { useState, useMemo } from "react";
import type { DocumentStructure, StructureCell, CellDataType } from "@/lib/doc-to-db/types";

// ============================================================
// Types
// ============================================================

interface StructureViewerProps {
  structure: DocumentStructure;
  cells?: StructureCell[];
  onCellClick?: (cell: StructureCell) => void;
  showRawText?: boolean;
  maxRows?: number;
}

// ============================================================
// Data Type Badge Colors
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

export function StructureViewer({
  structure,
  cells = [],
  onCellClick,
  showRawText = false,
  maxRows = 50,
}: StructureViewerProps) {
  const [showAllRows, setShowAllRows] = useState(false);

  // Calculate display rows
  const displayRows = useMemo(() => {
    if (!structure.rows) return [];
    if (showAllRows || structure.rows.length <= maxRows) {
      return structure.rows;
    }
    return structure.rows.slice(0, maxRows);
  }, [structure.rows, showAllRows, maxRows]);

  const hasMoreRows = structure.rows && structure.rows.length > maxRows;

  // Get cell by position
  const getCell = (rowIndex: number, colIndex: number): StructureCell | undefined => {
    return cells.find((c) => c.row_index === rowIndex && c.col_index === colIndex);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StructureTypeIcon type={structure.structure_type} />
            <div>
              <h3 className="font-semibold text-gray-900">
                {structure.title || `Untitled ${structure.structure_type}`}
              </h3>
              {structure.description && (
                <p className="text-sm text-gray-500 mt-0.5">{structure.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
              {structure.row_count} rows x {structure.column_count} cols
            </span>
            <StructureTypeBadge type={structure.structure_type} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {structure.structure_type === "table" && (
          <TableView
            headers={structure.headers || []}
            rows={displayRows as (string | number | boolean | null)[][]}
            cells={cells}
            onCellClick={onCellClick}
            getCell={getCell}
          />
        )}

        {structure.structure_type === "list" && (
          <ListView
            rows={displayRows as (string | number | boolean | null)[][]}
            onCellClick={onCellClick}
          />
        )}

        {structure.structure_type === "key_value" && (
          <KeyValueView
            rows={displayRows as (string | number | boolean | null)[][]}
            cells={cells}
            onCellClick={onCellClick}
          />
        )}

        {structure.structure_type === "hierarchy" && (
          <HierarchyView rawText={structure.raw_text || ""} />
        )}

        {structure.structure_type === "schema" && (
          <SchemaView schemaDef={structure.schema_def || []} />
        )}

        {/* Show more button */}
        {hasMoreRows && !showAllRows && (
          <button
            onClick={() => setShowAllRows(true)}
            className="mt-4 w-full py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Show all {structure.rows?.length} rows
          </button>
        )}

        {/* Raw text toggle */}
        {showRawText && structure.raw_text && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Show raw text
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-auto max-h-48">
              {structure.raw_text}
            </pre>
          </details>
        )}
      </div>

      {/* Footer with metadata */}
      {structure.source_location && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>
            Source: chars {structure.source_location.start_char || 0} -{" "}
            {structure.source_location.end_char || 0}
          </span>
          {structure.source_page && <span>Page {structure.source_page}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function TableView({
  headers,
  rows,
  cells: _cells,
  onCellClick,
  getCell,
}: {
  headers: string[];
  rows: (string | number | boolean | null)[][];
  cells: StructureCell[];
  onCellClick?: (cell: StructureCell) => void;
  getCell: (rowIndex: number, colIndex: number) => StructureCell | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-gray-700 bg-gray-50 first:rounded-tl-lg last:rounded-tr-lg"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
            >
              {row.map((cell, colIndex) => {
                const cellData = getCell(rowIndex, colIndex);
                return (
                  <td
                    key={colIndex}
                    className={`px-3 py-2 text-gray-600 ${
                      onCellClick && cellData ? "cursor-pointer hover:bg-blue-50" : ""
                    }`}
                    onClick={() => onCellClick && cellData && onCellClick(cellData)}
                  >
                    <CellValue value={cell} dataType={cellData?.data_type} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListView({
  rows,
  onCellClick: _onCellClick,
}: {
  rows: (string | number | boolean | null)[][];
  onCellClick?: (cell: StructureCell) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map((row, index) => (
        <li
          key={index}
          className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50"
        >
          <span className="text-gray-400 font-mono text-xs mt-0.5">{index + 1}.</span>
          <span className="text-gray-700 text-sm">{String(row[0])}</span>
        </li>
      ))}
    </ul>
  );
}

function KeyValueView({
  rows,
  cells,
  onCellClick,
}: {
  rows: (string | number | boolean | null)[][];
  cells: StructureCell[];
  onCellClick?: (cell: StructureCell) => void;
}) {
  return (
    <dl className="grid grid-cols-1 gap-2">
      {rows.map((row, index) => {
        const cellData = cells.find((c) => c.row_index === index);
        return (
          <div
            key={index}
            className={`flex items-start gap-3 px-3 py-2 rounded-lg bg-gray-50 ${
              onCellClick && cellData ? "cursor-pointer hover:bg-blue-50" : ""
            }`}
            onClick={() => onCellClick && cellData && onCellClick(cellData)}
          >
            <dt className="font-medium text-gray-900 min-w-[120px] flex-shrink-0">
              {String(row[0])}
            </dt>
            <dd className="text-gray-600 flex-1">
              <CellValue value={row[1]} dataType={cellData?.data_type} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function HierarchyView({ rawText }: { rawText: string }) {
  return (
    <pre className="p-4 bg-gray-50 rounded-lg text-sm text-gray-700 font-mono whitespace-pre-wrap">
      {rawText}
    </pre>
  );
}

function SchemaView({
  schemaDef,
}: {
  schemaDef: NonNullable<DocumentStructure["schema_def"]>;
}) {
  return (
    <div className="space-y-2">
      {schemaDef.map((field, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
          <span className="font-mono text-sm font-medium text-gray-900">{field.name}</span>
          <span
            className={`px-2 py-0.5 rounded text-xs ${
              dataTypeColors[field.type] || dataTypeColors.unknown
            }`}
          >
            {field.type}
          </span>
          {field.required && (
            <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600">required</span>
          )}
          {field.description && (
            <span className="text-xs text-gray-500">{field.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function CellValue({
  value,
  dataType,
}: {
  value: string | number | boolean | null;
  dataType?: CellDataType;
}) {
  if (value === null || value === undefined) {
    return <span className="text-gray-300 italic">null</span>;
  }

  const stringValue = String(value);

  // URL rendering
  if (dataType === "url" && typeof value === "string" && value.startsWith("http")) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {stringValue}
      </a>
    );
  }

  // Email rendering
  if (dataType === "email") {
    return (
      <a
        href={`mailto:${value}`}
        className="text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {stringValue}
      </a>
    );
  }

  // Boolean rendering
  if (dataType === "boolean") {
    const boolValue = value === true || value === "true" || value === "yes" || value === "1";
    return (
      <span className={boolValue ? "text-green-600" : "text-red-600"}>
        {boolValue ? "Yes" : "No"}
      </span>
    );
  }

  return <span>{stringValue}</span>;
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

export default StructureViewer;
