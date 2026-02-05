import { KeysPageSkeleton } from '@/components/skeletons';

/**
 * API Keys Route Loading State
 */
export default function KeysLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <KeysPageSkeleton />
    </div>
  );
}
