import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Search Result Item Skeleton
 */
export const SearchResultSkeleton = memo(function SearchResultSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-3 hover:bg-muted/50 transition-colors',
        className
      )}
    >
      {/* Header: Type + Relevance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>

      {/* Content with highlight */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24 bg-yellow-100" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-4/5" />
      </div>

      {/* Footer: Source + Date */}
      <div className="flex items-center gap-4 text-sm">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
});

/**
 * Search Results List Skeleton
 */
export const SearchResultsListSkeleton = memo(function SearchResultsListSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
    </div>
  );
});

/**
 * Search Page Skeleton
 *
 * Full search page with filters and results.
 */
export const SearchPageSkeleton = memo(function SearchPageSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Search Header */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-12 flex-1 rounded-lg" />
          <Skeleton className="h-12 w-28 rounded-lg" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </div>

      {/* Results Info */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>

      {/* Results */}
      <SearchResultsListSkeleton count={5} />

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  );
});

/**
 * Search Suggestions Skeleton (Autocomplete)
 */
export const SearchSuggestionsSkeleton = memo(function SearchSuggestionsSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg',
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
});

/**
 * Facet Filter Skeleton
 */
export const FacetFilterSkeleton = memo(function FacetFilterSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-4 w-20" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Search Filters Sidebar Skeleton
 */
export const SearchFiltersSkeleton = memo(function SearchFiltersSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-6 p-4', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>

      <FacetFilterSkeleton />
      <FacetFilterSkeleton />
      <FacetFilterSkeleton />

      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
});
