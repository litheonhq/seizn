import { PolicyMarketplacePageSkeleton } from '@/components/skeletons';

/**
 * Policy Marketplace Route Loading State
 */
export default function PolicyMarketplaceLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <PolicyMarketplacePageSkeleton />
    </div>
  );
}
