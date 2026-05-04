import { GovernancePageSkeleton } from '@/components/skeletons';

/**
 * Governance Route Loading State
 */
export default function GovernanceLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <GovernancePageSkeleton />
    </div>
  );
}
