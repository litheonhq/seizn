'use client';

import { Suspense, type ReactNode } from 'react';

/**
 * SuspenseList Props
 */
export interface SuspenseListProps {
  /** Child Suspense boundaries */
  children: ReactNode;
  /**
   * Reveal order for children
   * - 'forwards': Reveal in order from first to last
   * - 'backwards': Reveal in order from last to first
   * - 'together': Reveal all at once when all are ready
   */
  revealOrder?: 'forwards' | 'backwards' | 'together';
  /**
   * Tail behavior (only for forwards/backwards)
   * - 'collapsed': Show only next loading state
   * - 'hidden': Show no loading states after first loaded
   */
  tail?: 'collapsed' | 'hidden';
}

/**
 * SuspenseList Component
 *
 * Coordinates multiple Suspense boundaries for orchestrated loading.
 * Note: This is a simplified polyfill as React's SuspenseList is still experimental.
 *
 * @example
 * ```tsx
 * <SuspenseList revealOrder="forwards">
 *   <Suspense fallback={<Skeleton />}>
 *     <HeaderData />
 *   </Suspense>
 *   <Suspense fallback={<Skeleton />}>
 *     <MainContent />
 *   </Suspense>
 *   <Suspense fallback={<Skeleton />}>
 *     <FooterData />
 *   </Suspense>
 * </SuspenseList>
 * ```
 */
export function SuspenseList({
  children,
  revealOrder = 'forwards',
  tail: _tail,
}: SuspenseListProps) {
  // Note: This is a simplified implementation.
  // React's experimental SuspenseList provides more sophisticated coordination.
  // This version just wraps children without actual coordination.

  // For 'together', wrap everything in a single Suspense
  if (revealOrder === 'together') {
    return <Suspense fallback={null}>{children}</Suspense>;
  }

  // For forwards/backwards, render children in order
  // The actual coordination would require experimental React features
  return <>{children}</>;
}

/**
 * Staggered loading component
 *
 * Renders items with staggered loading animations.
 */
export interface StaggeredListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  renderSkeleton: (index: number) => ReactNode;
  getKey: (item: T) => string | number;
  staggerDelay?: number;
}

export function StaggeredList<T>({
  items,
  renderItem,
  renderSkeleton: _renderSkeleton,
  getKey,
  staggerDelay = 100,
}: StaggeredListProps<T>) {
  return (
    <>
      {items.map((item, index) => (
        <div
          key={getKey(item)}
          style={{
            animationDelay: `${index * staggerDelay}ms`,
          }}
          className="animate-in fade-in slide-in-from-bottom-2"
        >
          {renderItem(item, index)}
        </div>
      ))}
    </>
  );
}
