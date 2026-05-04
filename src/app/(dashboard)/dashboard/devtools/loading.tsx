import { DevToolsPageSkeleton } from '@/components/skeletons';

/**
 * DevTools Route Loading State
 */
export default function DevToolsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <DevToolsPageSkeleton />
    </div>
  );
}
