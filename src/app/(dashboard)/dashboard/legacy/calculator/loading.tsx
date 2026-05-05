import { CalculatorPageSkeleton } from '@/components/skeletons';

/**
 * Calculator Route Loading State
 */
export default function CalculatorLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <CalculatorPageSkeleton />
    </div>
  );
}
