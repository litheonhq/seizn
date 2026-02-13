'use client';

import { Suspense, use, type ReactNode, useState, useEffect, useMemo } from 'react';

/**
 * Props for DataLoader
 */
export interface DataLoaderProps<T> {
  /** Function that returns a promise - will be called once */
  load: () => Promise<T>;
  /** Render function for loaded data */
  children: (data: T) => ReactNode;
  /** Loading fallback */
  fallback: ReactNode;
  /** Key to trigger reload */
  reloadKey?: string | number;
  /** Cache the result */
  cache?: boolean;
}

// Simple cache for loaded data
const dataCache = new Map<string, unknown>();

/**
 * DataConsumer component that uses the promise
 */
function DataConsumerWithCache<T>({
  promiseFactory,
  children,
  cacheKey,
  useCache,
}: {
  promiseFactory: () => Promise<T>;
  children: (data: T) => ReactNode;
  cacheKey: string;
  useCache: boolean;
}) {
  const promise = useMemo(() => {
    if (useCache && dataCache.has(cacheKey)) {
      return Promise.resolve(dataCache.get(cacheKey) as T);
    }

    const p = promiseFactory();
    if (useCache) {
      p.then((data) => dataCache.set(cacheKey, data));
    }
    return p;
  }, [cacheKey, promiseFactory, useCache]);

  const data = use(promise);
  return <>{children(data)}</>;
}

/**
 * DataLoader Component
 *
 * Client-side data loading with Suspense support.
 * Useful for loading data that doesn't need to be server-rendered.
 *
 * @example
 * ```tsx
 * <DataLoader
 *   load={() => fetchMemories(userId)}
 *   fallback={<MemoryListSkeleton />}
 *   cache
 * >
 *   {(memories) => <MemoryList memories={memories} />}
 * </DataLoader>
 * ```
 */
export function DataLoader<T>({
  load,
  children,
  fallback,
  reloadKey = 'default',
  cache = false,
}: DataLoaderProps<T>) {
  const cacheKey = `data-loader:${reloadKey}`;

  return (
    <Suspense fallback={fallback}>
      <DataConsumerWithCache
        key={reloadKey}
        promiseFactory={load}
        cacheKey={cacheKey}
        useCache={cache}
      >
        {children}
      </DataConsumerWithCache>
    </Suspense>
  );
}

/**
 * Deferred loading component - loads after initial render
 */
export interface DeferredLoaderProps<T> {
  load: () => Promise<T>;
  children: (data: T | null, isLoading: boolean, error: Error | null) => ReactNode;
  delay?: number;
}

export function DeferredLoader<T>({
  load,
  children,
  delay = 0,
}: DeferredLoaderProps<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (cancelled) return;

        const result = await load();

        if (cancelled) return;

        setData(result);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [load, delay]);

  return <>{children(data, isLoading, error)}</>;
}

/**
 * Prefetch utility
 *
 * Start loading data before component mounts.
 */
export function prefetch<T>(key: string, load: () => Promise<T>): void {
  if (!dataCache.has(key)) {
    load().then((data) => dataCache.set(key, data));
  }
}

/**
 * Clear prefetched data
 */
export function clearPrefetch(key?: string): void {
  if (key) {
    dataCache.delete(key);
  } else {
    dataCache.clear();
  }
}

/**
 * Get prefetched data synchronously
 */
export function getPrefetched<T>(key: string): T | undefined {
  return dataCache.get(key) as T | undefined;
}
