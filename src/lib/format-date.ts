/**
 * Locale-aware date formatting utility.
 *
 * Replaces hard-coded `toLocaleDateString("en-US", ...)` calls
 * with a consistent, locale-respecting formatter.
 */

const SHORT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const LONG_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const COMPACT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

const STYLE_MAP: Record<string, Intl.DateTimeFormatOptions> = {
  short: SHORT_OPTIONS,
  long: LONG_OPTIONS,
  compact: COMPACT_OPTIONS,
};

export function formatDate(
  date: string | Date,
  style: "short" | "long" | "compact" = "short"
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, STYLE_MAP[style]).format(d);
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(dateStr);
}
