/**
 * Dashboard Route Loading State
 *
 * Minimal centered indeterminate progress bar. Replaces the prior
 * skeleton layout that no longer matched the live dashboard composition.
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div
        className="relative h-[2px] w-[200px] overflow-hidden rounded-full"
        style={{ background: 'var(--ink-100)' }}
      >
        <span
          className="animate-indeterminate-bar absolute inset-y-0 rounded-full"
          style={{ background: 'var(--ink-900)' }}
        />
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
