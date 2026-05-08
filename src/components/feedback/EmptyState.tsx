import type { ReactNode } from 'react';

/**
 * Standard empty state (plan W4.3).
 *
 * Use for "no rows" surfaces (empty inbox, no memories, no characters).
 * Pairs with LoadingState for the loading transition and ErrorState for failure.
 *
 * Visual rule: muted background panel + serif headline + secondary body + optional
 * primary CTA. No icons by default — keep it editorial.
 */
export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Optional small text shown below the CTA (e.g. "Or import from Notion"). */
  secondary?: ReactNode;
  /** ARIA label for the empty region. Defaults to title. */
  ariaLabel?: string;
}

export function EmptyState({ title, body, cta, secondary, ariaLabel }: EmptyStateProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? title}
      className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border px-6 py-16 text-center"
      style={{
        borderColor: 'var(--ink-100)',
        background: 'var(--bg-muted)',
        color: 'var(--text-primary)',
      }}
    >
      <h2 className="author-serif text-2xl">{title}</h2>
      {body ? (
        <p className="max-w-md text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {body}
        </p>
      ) : null}
      {cta ? (
        cta.href ? (
          <a
            href={cta.href}
            className="author-btn mt-2 px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
          >
            {cta.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="author-btn mt-2 px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
          >
            {cta.label}
          </button>
        )
      ) : null}
      {secondary ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {secondary}
        </p>
      ) : null}
    </section>
  );
}
