import { EnterprisePageSkeleton } from '@/components/skeletons';

/**
 * Enterprise Route Loading State
 */
export default function EnterpriseLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <EnterprisePageSkeleton />
    </div>
  );
}
