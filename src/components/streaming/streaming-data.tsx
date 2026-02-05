'use client';

import { Suspense, use, type ReactNode } from 'react';

/**
 * Props for StreamingData
 */
export interface StreamingDataProps<T> {
  /** Promise that resolves to data */
  dataPromise: Promise<T>;
  /** Render function that receives the resolved data */
  children: (data: T) => ReactNode;
  /** Loading fallback */
  fallback: ReactNode;
}

/**
 * Internal component that uses the promise
 */
function DataConsumer<T>({
  dataPromise,
  children,
}: {
  dataPromise: Promise<T>;
  children: (data: T) => ReactNode;
}) {
  const data = use(dataPromise);
  return <>{children(data)}</>;
}

/**
 * StreamingData Component
 *
 * Enables streaming data from Server Components to Client Components.
 * The promise is passed down and resolved on the client with Suspense.
 *
 * @example
 * ```tsx
 * // In a Server Component
 * async function MemoryPageServer({ userId }: { userId: string }) {
 *   const memoriesPromise = getMemories(userId); // Don't await!
 *
 *   return (
 *     <StreamingData
 *       dataPromise={memoriesPromise}
 *       fallback={<MemoryListSkeleton />}
 *     >
 *       {(memories) => <MemoryList memories={memories} />}
 *     </StreamingData>
 *   );
 * }
 * ```
 */
export function StreamingData<T>({
  dataPromise,
  children,
  fallback,
}: StreamingDataProps<T>) {
  return (
    <Suspense fallback={fallback}>
      <DataConsumer dataPromise={dataPromise}>{children}</DataConsumer>
    </Suspense>
  );
}

/**
 * Multiple data streams component
 */
export interface MultiStreamProps<T extends Record<string, unknown>> {
  /** Object of promises */
  promises: { [K in keyof T]: Promise<T[K]> };
  /** Render function */
  children: (data: T) => ReactNode;
  /** Loading fallback */
  fallback: ReactNode;
}

/**
 * MultiStreamConsumer - Resolves multiple promises
 */
function MultiStreamConsumer<T extends Record<string, unknown>>({
  promises,
  children,
}: {
  promises: { [K in keyof T]: Promise<T[K]> };
  children: (data: T) => ReactNode;
}) {
  const data = {} as T;

  for (const key of Object.keys(promises) as (keyof T)[]) {
    data[key] = use(promises[key]);
  }

  return <>{children(data)}</>;
}

/**
 * MultiStream Component
 *
 * Stream multiple data sources in parallel.
 *
 * @example
 * ```tsx
 * <MultiStream
 *   promises={{
 *     memories: getMemories(userId),
 *     stats: getStats(userId),
 *     profile: getProfile(userId),
 *   }}
 *   fallback={<DashboardSkeleton />}
 * >
 *   {({ memories, stats, profile }) => (
 *     <Dashboard memories={memories} stats={stats} profile={profile} />
 *   )}
 * </MultiStream>
 * ```
 */
export function MultiStream<T extends Record<string, unknown>>({
  promises,
  children,
  fallback,
}: MultiStreamProps<T>) {
  return (
    <Suspense fallback={fallback}>
      <MultiStreamConsumer promises={promises}>{children}</MultiStreamConsumer>
    </Suspense>
  );
}
