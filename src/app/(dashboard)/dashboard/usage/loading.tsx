import { UsagePageSkeleton } from '@/components/skeletons';

/**
 * Usage Route Loading State
 */
export default function UsageLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <UsagePageSkeleton />
    </div>
  );
}
