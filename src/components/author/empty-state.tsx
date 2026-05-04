'use client';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  body: string;
  icon?: ReactNode;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, body, icon, cta }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-8 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex h-6 w-6 items-center justify-center text-slate-400">
          {icon}
        </div>
      ) : null}
      <div className="text-base font-medium text-slate-700">{title}</div>
      <p className="mx-auto mt-2 max-w-[480px] text-sm leading-6 text-slate-600">
        {body}
      </p>
      {cta ? (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          {cta.label}
        </button>
      ) : null}
    </div>
  );
}
