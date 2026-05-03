"use client";

import { CloudCog } from "lucide-react";
import type { AuthorSettingsCopy } from "./author-settings-types";

interface SyncPlaceholderProps {
  copy: AuthorSettingsCopy["sync"];
}

export function SyncPlaceholder({ copy }: SyncPlaceholderProps) {
  return (
    <section className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5" aria-labelledby="author-settings-sync">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CloudCog className="h-5 w-5 text-[var(--ink-900)]" aria-hidden="true" />
            <h2 id="author-settings-sync" className="text-lg font-semibold text-[var(--ink-900)]">
              {copy.title}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">{copy.description}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-[var(--ink-50)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-600)]">
          {copy.comingSoon}
        </span>
      </div>
      <div className="mt-5 rounded-md border border-dashed border-[var(--ink-200)] bg-[var(--ink-50)] p-4">
        <p className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.status}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{copy.comingSoon}</p>
      </div>
    </section>
  );
}
