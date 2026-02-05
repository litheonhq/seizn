import { AnalyticsPageSkeleton } from '@/components/skeletons';

/**
 * Analytics Route Loading State
 */
export default function AnalyticsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <AnalyticsPageSkeleton />
    </div>
  );
}
