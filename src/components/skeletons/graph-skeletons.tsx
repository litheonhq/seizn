import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Graph/MindMap Loading Skeleton
 *
 * Shows placeholder for graph visualization.
 */
export const GraphSkeleton = memo(function GraphSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative w-full h-full min-h-[400px] rounded-lg border bg-muted/20',
        className
      )}
    >
      {/* Center node */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>

      {/* Surrounding nodes */}
      <div className="absolute top-1/4 left-1/4">
        <Skeleton className="h-10 w-10 rounded-full opacity-75" />
      </div>
      <div className="absolute top-1/4 right-1/4">
        <Skeleton className="h-12 w-12 rounded-full opacity-75" />
      </div>
      <div className="absolute bottom-1/4 left-1/3">
        <Skeleton className="h-10 w-10 rounded-full opacity-75" />
      </div>
      <div className="absolute bottom-1/4 right-1/3">
        <Skeleton className="h-8 w-8 rounded-full opacity-75" />
      </div>
      <div className="absolute top-1/3 left-1/6">
        <Skeleton className="h-8 w-8 rounded-full opacity-50" />
      </div>
      <div className="absolute top-1/3 right-1/6">
        <Skeleton className="h-8 w-8 rounded-full opacity-50" />
      </div>
      <div className="absolute bottom-1/3 left-1/4">
        <Skeleton className="h-6 w-6 rounded-full opacity-50" />
      </div>
      <div className="absolute bottom-1/3 right-1/4">
        <Skeleton className="h-6 w-6 rounded-full opacity-50" />
      </div>

      {/* Loading indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full animate-bounce" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
});

/**
 * MindMap Page Skeleton
 */
export const MindMapPageSkeleton = memo(function MindMapPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="w-px h-6 bg-border mx-2" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 relative">
        <GraphSkeleton className="absolute inset-0 rounded-none border-0" />
      </div>

      {/* Minimap */}
      <div className="absolute bottom-4 right-4 w-40 h-28 rounded-lg border bg-card/80 backdrop-blur-sm">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    </div>
  );
});

/**
 * Node Details Panel Skeleton
 */
export const NodeDetailsSkeleton = memo(function NodeDetailsSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('w-80 border-l p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Content */}
      <div className="space-y-2 pt-4 border-t">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>

      {/* Metadata */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      {/* Connections */}
      <div className="space-y-3 pt-4 border-t">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 flex-1 rounded-md" />
      </div>
    </div>
  );
});

/**
 * Community Card Skeleton
 */
export const CommunityCardSkeleton = memo(function CommunityCardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-8" />
      </div>

      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />

      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-6 rounded-full -ml-1 first:ml-0" />
        ))}
        <Skeleton className="h-4 w-12 ml-2" />
      </div>
    </div>
  );
});

/**
 * Graph Statistics Skeleton
 */
export const GraphStatsSkeleton = memo(function GraphStatsSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-4 gap-4', className)}>
      <div className="rounded-lg border p-3 space-y-1">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="rounded-lg border p-3 space-y-1">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="rounded-lg border p-3 space-y-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-10" />
      </div>
      <div className="rounded-lg border p-3 space-y-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-14" />
      </div>
    </div>
  );
});

/**
 * Graph Legend Skeleton
 */
export const GraphLegendSkeleton = memo(function GraphLegendSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 flex-wrap', className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton
            className="h-3 w-3 rounded-full"
            style={{ animationDelay: `${i * 100}ms` }}
          />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
});
