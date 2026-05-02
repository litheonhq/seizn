"use client";

import { CloudCog } from "lucide-react";
import type { AuthorSettingsCopy } from "./author-settings-types";

interface SyncPlaceholderProps {
  copy: AuthorSettingsCopy["sync"];
}

export function SyncPlaceholder({ copy }: SyncPlaceholderProps) {
  return (
    <section className="rounded-lg border border-szn-border bg-szn-card p-5" aria-labelledby="author-settings-sync">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CloudCog className="h-5 w-5 text-szn-accent" aria-hidden="true" />
            <h2 id="author-settings-sync" className="text-lg font-semibold text-szn-text-1">
              {copy.title}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-szn-text-2">{copy.description}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-szn-surface px-2.5 py-1 text-xs font-semibold text-szn-text-2">
          {copy.comingSoon}
        </span>
      </div>
      <div className="mt-5 rounded-md border border-dashed border-szn-border bg-szn-bg p-4">
        <p className="text-xs font-medium uppercase text-szn-text-3">{copy.status}</p>
        <p className="mt-1 text-sm font-semibold text-szn-text-1">{copy.comingSoon}</p>
      </div>
    </section>
  );
}
