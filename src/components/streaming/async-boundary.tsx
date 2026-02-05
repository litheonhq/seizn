'use client';

import { Suspense, type ReactNode, type ComponentType } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

/**
 * Props for AsyncBoundary
 */
export interface AsyncBoundaryProps {
  /** The async content to render */
  children: ReactNode;
  /** Loading fallback component */
  loadingFallback: ReactNode;
  /** Error fallback component (optional) */
  errorFallback?: ComponentType<FallbackProps>;
  /** Whether to catch errors (default: true) */
  catchErrors?: boolean;
  /** Called when an error is caught */
  onError?: (error: unknown, info: { componentStack?: string | null }) => void;
  /** Called when error boundary is reset */
  onReset?: () => void;
}

/**
 * Default error fallback component
 */
function DefaultErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
      <h3 className="font-semibold text-destructive">Something went wrong</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {errorMessage}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="mt-3 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * AsyncBoundary Component
 *
 * Combines Suspense and ErrorBoundary for comprehensive async handling.
 * Use this to wrap Server Components that fetch data asynchronously.
 *
 * @example
 * ```tsx
 * // In a parent client component or page
 * <AsyncBoundary
 *   loadingFallback={<MemoryListSkeleton />}
 *   errorFallback={CustomErrorComponent}
 * >
 *   <MemoryListServer userId={userId} />
 * </AsyncBoundary>
 * ```
 */
export function AsyncBoundary({
  children,
  loadingFallback,
  errorFallback = DefaultErrorFallback,
  catchErrors = true,
  onError,
  onReset,
}: AsyncBoundaryProps) {
  const content = <Suspense fallback={loadingFallback}>{children}</Suspense>;

  if (!catchErrors) {
    return content;
  }

  return (
    <ErrorBoundary
      FallbackComponent={errorFallback}
      onError={onError}
      onReset={onReset}
    >
      {content}
    </ErrorBoundary>
  );
}

/**
 * Minimal AsyncBoundary without error handling
 * Use when parent handles errors
 */
export function AsyncSuspense({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
