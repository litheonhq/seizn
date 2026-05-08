'use client';

import type { ReactNode } from 'react';

/**
 * Standard error state (plan W4.3).
 *
 * Use:
 *   - SWR `error` branch in client components
 *   - `error.tsx` route boundaries (pass `reset` from props)
 *   - Suspense fallback when retrying is meaningful
 *
 * Visual rule: warm sev-p1 panel (terracotta-toned) + clear restart CTA. We do
 * NOT show raw error.message in production by default — wire `details` only when
 * the surface is for an admin/dev (e.g. /admin/metrics).
 */

interface ErrorStateProps {
  title: string;
  body?: ReactNode;
  /** Recovery action — calls reset() from error boundary or refetch from SWR. */
  retry?: () => void;
  retryLabel?: string;
  /** Optional dev-only detail. Hidden if undefined. Always a string for safety. */
  details?: string;
  /** Pre-formatted incident id for support. */
  incidentId?: string;
}

export function ErrorState({
  title,
  body,
  retry,
  retryLabel = 'Try again',
  details,
  incidentId,
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border px-6 py-12 text-center"
      style={{
        borderColor: 'var(--sev-p1-border)',
        background: 'var(--sev-p1-bg)',
        color: 'var(--sev-p1-text)',
      }}
    >
      <h2 className="author-serif text-2xl">{title}</h2>
      {body ? (
        <p className="max-w-md text-sm leading-6" style={{ color: 'var(--sev-p1-text)' }}>
          {body}
        </p>
      ) : null}
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="author-btn mt-2 px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
        >
          {retryLabel}
        </button>
      ) : null}
      {incidentId ? (
        <p className="mt-2 font-mono text-xs" style={{ color: 'var(--sev-p1-text)' }}>
          Reference: {incidentId}
        </p>
      ) : null}
      {details ? (
        <details className="mt-2 text-left text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 max-w-md overflow-auto whitespace-pre-wrap rounded-md p-2" style={{ background: 'var(--ink-100)' }}>
            {details}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
