import { PlaygroundPageSkeleton } from '@/components/skeletons';

/**
 * Playground Route Loading State
 */
export default function PlaygroundLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <PlaygroundPageSkeleton />
    </div>
  );
}
