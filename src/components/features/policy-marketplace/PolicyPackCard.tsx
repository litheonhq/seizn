"use client";

export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  category: "governance" | "compliance" | "security" | "performance" | "custom";
  version: string;
  author: string;
  rulesCount: number;
  installed: boolean;
  popular: boolean;
  tags: string[];
}

const CATEGORY_STYLES: Record<
  PolicyPack["category"],
  { bg: string; text: string; label: string }
> = {
  governance: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    label: "Governance",
  },
  compliance: {
    bg: "bg-[var(--ink-50)] dark:bg-[var(--ink-900)]/30",
    text: "text-[var(--ink-900)] underline dark:text-[var(--ink-500)]",
    label: "Compliance",
  },
  security: {
    bg: "bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/30",
    text: "text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]",
    label: "Security",
  },
  performance: {
    bg: "bg-[var(--signal-canon-soft)] dark:bg-[var(--signal-canon-ink)]/30",
    text: "text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]",
    label: "Performance",
  },
  custom: {
    bg: "bg-slate-50 dark:bg-slate-800/30",
    text: "text-slate-700 dark:text-slate-300",
    label: "Custom",
  },
};

interface PolicyPackCardProps {
  pack: PolicyPack;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

export function PolicyPackCard({
  pack,
  onInstall,
  onUninstall,
}: PolicyPackCardProps) {
  const catStyle = CATEGORY_STYLES[pack.category];

  return (
    <div className="rounded-lg border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 shadow-[0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)] transition-all duration-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
            {pack.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            v{pack.version} &middot; by {pack.author}
          </p>
        </div>
        {pack.popular && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending)]/30 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] ring-1 ring-amber-200 dark:ring-amber-800">
            Popular
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-4 flex-1">
        {pack.description}
      </p>

      {/* Tags & Category */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${catStyle.bg} ${catStyle.text}`}
        >
          {catStyle.label}
        </span>
        {pack.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/50">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {pack.rulesCount} rules
        </span>
        {pack.installed ? (
          <button
            onClick={() => onUninstall(pack.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Uninstall
          </button>
        ) : (
          <button
            onClick={() => onInstall(pack.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
