import { RerankerPageSkeleton } from '@/components/skeletons';

/**
 * Reranker Route Loading State
 */
export default function RerankerLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <RerankerPageSkeleton />
    </div>
  );
}
