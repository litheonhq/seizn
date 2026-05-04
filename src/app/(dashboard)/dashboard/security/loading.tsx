import { SecurityPageSkeleton } from '@/components/skeletons';

/**
 * Security Route Loading State
 */
export default function SecurityLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <SecurityPageSkeleton />
    </div>
  );
}
