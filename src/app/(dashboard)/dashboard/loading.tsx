import { DashboardPageSkeleton } from '@/components/skeletons';

/**
 * Dashboard Route Loading State
 *
 * Displayed while the dashboard page is loading server data.
 */
export default function DashboardLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <DashboardPageSkeleton />
    </div>
  );
}
