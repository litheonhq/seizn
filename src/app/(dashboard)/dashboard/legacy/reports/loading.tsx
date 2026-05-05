import { ReportsPageSkeleton } from '@/components/skeletons';

/**
 * Reports Route Loading State
 */
export default function ReportsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <ReportsPageSkeleton />
    </div>
  );
}
