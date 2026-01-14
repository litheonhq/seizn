"use client";

import { ReactNode } from "react";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => ReactNode;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  className?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  mobileCardClassName?: string;
  isLoading?: boolean;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  emptyMessage = "No data available",
  emptyIcon,
  onRowClick,
  mobileCardClassName = "",
  isLoading = false,
}: ResponsiveTableProps<T>) {
  const visibleColumns = columns.filter((col) => !col.hideOnMobile);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {/* Desktop skeleton */}
        <div className="hidden md:block">
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-gray-200 rounded-lg" />
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-16 bg-gray-100 rounded-lg" />
          </div>
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          <div className="animate-pulse h-32 bg-gray-100 rounded-2xl" />
          <div className="animate-pulse h-32 bg-gray-100 rounded-2xl" />
          <div className="animate-pulse h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        {emptyIcon && <div className="mb-4">{emptyIcon}</div>}
        <p className="text-sm sm:text-base">{emptyMessage}</p>
      </div>
    );
  }

  const getValue = (item: T, key: keyof T | string): unknown => {
    if (typeof key === "string" && key.includes(".")) {
      const keys = key.split(".");
      let value: unknown = item;
      for (const k of keys) {
        value = (value as Record<string, unknown>)?.[k];
      }
      return value;
    }
    return item[key as keyof T];
  };

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`text-left py-3 px-4 text-sm font-semibold text-gray-600 ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={`py-4 px-4 text-sm ${col.className || ""}`}
                  >
                    {col.render
                      ? col.render(item)
                      : String(getValue(item, col.key) ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={`glass-card rounded-2xl p-4 space-y-3 ${
              onRowClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""
            } ${mobileCardClassName}`}
          >
            {visibleColumns.map((col, index) => {
              const content = col.render
                ? col.render(item)
                : String(getValue(item, col.key) ?? "");
              const label = col.mobileLabel || col.header;

              // First item is usually the title/name - render it prominently
              if (index === 0) {
                return (
                  <div key={String(col.key)} className="font-semibold text-gray-900">
                    {content}
                  </div>
                );
              }

              return (
                <div
                  key={String(col.key)}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-900 font-medium">{content}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// Convenience component for action buttons that are touch-friendly on mobile
interface TableActionProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  variant?: "default" | "danger" | "primary";
  disabled?: boolean;
}

export function TableAction({
  onClick,
  icon,
  label,
  variant = "default",
  disabled = false,
}: TableActionProps) {
  const baseClasses =
    "p-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded-lg transition-colors";

  const variantClasses = {
    default: "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
    danger: "text-red-400 hover:text-red-600 hover:bg-red-50",
    primary: "text-teal-500 hover:text-teal-600 hover:bg-teal-50",
  };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

// Badge component for status indicators
interface StatusBadgeProps {
  status: "active" | "inactive" | "warning" | "error";
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusClasses = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-gray-100 text-gray-600",
    warning: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses[status]}`}
    >
      {label}
    </span>
  );
}
