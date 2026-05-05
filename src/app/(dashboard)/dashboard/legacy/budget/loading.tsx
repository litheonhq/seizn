import { BudgetPageSkeleton } from '@/components/skeletons';

/**
 * Budget Route Loading State
 */
export default function BudgetLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <BudgetPageSkeleton />
    </div>
  );
}
