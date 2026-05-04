import { AutopilotPageSkeleton } from '@/components/skeletons';

/**
 * Autopilot Route Loading State
 */
export default function AutopilotLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <AutopilotPageSkeleton />
    </div>
  );
}
