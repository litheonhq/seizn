"use client";

import type { ReactNode } from "react";
import { formatDate } from "@/lib/format-date";

type LockedMemory = {
  id: string;
  memory_type: string;
  tags: string[];
  created_at: string;
  importance?: number;
  source?: string;
  similarity?: number;
};

export interface LockedMemoryCardProps {
  memory: LockedMemory;
  onUnlockRequest: () => void;
  footer?: ReactNode;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5A2.25 2.25 0 0119.5 12.75v6A2.25 2.25 0 0117.25 21H6.75A2.25 2.25 0 014.5 18.75v-6A2.25 2.25 0 016.75 10.5z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function getTypeColor(type: string) {
  switch (type) {
    case "fact": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "preference": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "experience": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "relationship": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "instruction": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    default: return "bg-szn-surface text-szn-text-2";
  }
}

// formatDate imported from @/lib/format-date

export function LockedMemoryCard({ memory, onUnlockRequest, footer }: LockedMemoryCardProps) {
  return (
    <div className="szn-card rounded-lg p-4 hover:border-szn-accent/50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-szn-surface flex items-center justify-center">
              <LockIcon className="w-5 h-5 text-szn-text-2" />
            </div>
            <div className="min-w-0">
              <p className="text-szn-text-1 font-medium">
                This memory is encrypted
              </p>
              <p className="text-sm text-szn-text-2">
                Enter your PIN to decrypt and view its contents.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onUnlockRequest}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-szn-accent to-szn-accent/80 text-white text-sm font-medium hover:from-szn-accent hover:to-szn-accent transition-colors"
          >
            <LockIcon className="w-4 h-4" />
            Unlock
          </button>

          {/* Metadata */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className={`px-2 py-0.5 rounded-full ${getTypeColor(memory.memory_type)}`}>
              {memory.memory_type}
            </span>

            {memory.tags && memory.tags.length > 0 && (
              <div className="flex items-center gap-1">
                <TagIcon className="w-3 h-3 text-szn-text-3" />
                {memory.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-szn-text-2">
                    {tag}
                  </span>
                ))}
                {memory.tags.length > 3 && (
                  <span className="text-szn-text-3">+{memory.tags.length - 3}</span>
                )}
              </div>
            )}

            <span className="flex items-center gap-1 text-szn-text-3">
              <CalendarIcon className="w-3 h-3" />
              {formatDate(memory.created_at, "long")}
            </span>

            {memory.similarity !== undefined && memory.similarity > 0 && (
              <span className="text-szn-accent">
                {(memory.similarity * 100).toFixed(1)}% match
              </span>
            )}
          </div>

          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

