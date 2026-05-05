import { EvalsPageSkeleton } from '@/components/skeletons';

/**
 * Evals Route Loading State
 */
export default function EvalsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <EvalsPageSkeleton />
    </div>
  );
}
