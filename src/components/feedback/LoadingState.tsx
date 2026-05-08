/**
 * Standard loading state (plan W4.3).
 *
 * Three variants:
 *   - "skeleton" (default): 3 stacked rectangular shimmers, generic for list views.
 *   - "spinner": small centered spinner for tight controls (inline buttons etc).
 *   - "page":     full-height centered spinner + label, used by `loading.tsx` files.
 *
 * The skeleton uses the existing `@keyframes sk` defined in tokens.css.
 */

interface LoadingStateProps {
  variant?: 'skeleton' | 'spinner' | 'page';
  label?: string;
  rows?: number;
}

export function LoadingState({ variant = 'skeleton', label, rows = 3 }: LoadingStateProps) {
  if (variant === 'spinner') {
    return <Spinner size="sm" label={label} />;
  }
  if (variant === 'page') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Loading'}
        className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3"
      >
        <Spinner size="lg" />
        {label ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={label ?? 'Loading'} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full rounded-md"
          style={{
            backgroundImage:
              'linear-gradient(90deg, var(--ink-100) 0%, var(--ink-50) 50%, var(--ink-100) 100%)',
            backgroundSize: '200% 100%',
            animation: 'sk 1.4s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

function Spinner({ size = 'sm', label }: { size?: 'sm' | 'lg'; label?: string }) {
  const px = size === 'lg' ? 32 : 18;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label ?? 'Loading'}
      style={{ animation: 'spin 0.9s linear infinite' }}
    >
      <circle cx="12" cy="12" r="10" stroke="var(--ink-200)" strokeWidth="3" fill="none" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="var(--accent-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
