import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Memory Card Skeleton
 *
 * Matches the layout of a memory card component.
 */
export const MemoryCardSkeleton = memo(function MemoryCardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 space-y-3 transition-all',
        className
      )}
    >
      {/* Header: Type badge + timestamp */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-12 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-10 rounded-full" />
      </div>

      {/* Footer: Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
});

/**
 * Memory List Skeleton
 *
 * Multiple memory cards for list views.
 */
export const MemoryListSkeleton = memo(function MemoryListSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <MemoryCardSkeleton key={i} />
      ))}
    </div>
  );
});

/**
 * Memory Detail Skeleton
 *
 * Full memory view with all fields.
 */
export const MemoryDetailSkeleton = memo(function MemoryDetailSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Content */}
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-2">
          <Skeleton className="h-4 w-16" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-18 rounded-full" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>

      {/* Linked Memories */}
      <div className="rounded-lg border p-4 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <MemoryCardSkeleton />
          <MemoryCardSkeleton />
        </div>
      </div>
    </div>
  );
});

/**
 * Memory Candidate Skeleton
 *
 * For pending memory candidates.
 */
export const CandidateSkeleton = memo(function CandidateSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed p-4 space-y-3 bg-muted/30',
        className
      )}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-20" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Content preview */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
});

/**
 * Candidate List Skeleton
 */
export const CandidateListSkeleton = memo(function CandidateListSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CandidateSkeleton key={i} />
      ))}
    </div>
  );
});

/**
 * Memory Timeline Skeleton
 *
 * For chronological memory views.
 */
export const MemoryTimelineSkeleton = memo(function MemoryTimelineSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      {/* Timeline items */}
      <div className="space-y-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="relative flex gap-4 pl-10">
            {/* Dot */}
            <Skeleton className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full" />

            {/* Content */}
            <div className="flex-1 space-y-2 pb-6">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Profile Card Skeleton
 *
 * For user profile summary cards.
 */
export const ProfileCardSkeleton = memo(function ProfileCardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-6 space-y-4', className)}>
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center space-y-1">
          <Skeleton className="h-6 w-12 mx-auto" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </div>
        <div className="text-center space-y-1">
          <Skeleton className="h-6 w-12 mx-auto" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </div>
        <div className="text-center space-y-1">
          <Skeleton className="h-6 w-12 mx-auto" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Skeleton className="h-4 w-20" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-18 rounded-full" />
        </div>
      </div>
    </div>
  );
});
