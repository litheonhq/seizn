import { PrivacyPageSkeleton } from '@/components/skeletons';

/**
 * Privacy Route Loading State
 */
export default function PrivacyLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <PrivacyPageSkeleton />
    </div>
  );
}
