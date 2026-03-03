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
            <div className="h-12 bg-szn-surface-2 rounded-lg" />
            <div className="h-16 bg-szn-surface-1 rounded-lg" />
            <div className="h-16 bg-szn-surface-1 rounded-lg" />
            <div className="h-16 bg-szn-surface-1 rounded-lg" />
          </div>
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          <div className="animate-pulse h-32 bg-szn-surface-1 rounded-2xl" />
          <div className="animate-pulse h-32 bg-szn-surface-1 rounded-2xl" />
          <div className="animate-pulse h-32 bg-szn-surface-1 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-szn-text-2">
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
            <tr className="border-b border-szn-border">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`text-left py-3 px-4 text-sm font-semibold text-szn-text-2 ${col.className || ""}`}
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
                className={`border-b border-szn-border/50 hover:bg-szn-surface-1 transition-colors ${
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
            className={`szn-card rounded-2xl p-4 space-y-3 ${
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
                  <div key={String(col.key)} className="font-semibold text-szn-text-1">
                    {content}
                  </div>
                );
              }

              return (
                <div
                  key={String(col.key)}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-szn-text-2">{label}</span>
                  <span className="text-szn-text-1 font-medium">{content}</span>
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
    default: "text-szn-text-3 hover:text-szn-text-2 hover:bg-szn-surface",
    danger: "text-red-400 hover:text-red-600 hover:bg-red-50",
    primary: "text-szn-accent hover:text-szn-accent hover:bg-szn-accent/10",
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
    active: "szn-badge szn-badge-success",
    inactive: "szn-badge szn-badge-muted",
    warning: "szn-badge szn-badge-warning",
    error: "szn-badge szn-badge-error",
  };

  return (
    <span
      className={statusClasses[status]}
    >
      {label}
    </span>
  );
}
