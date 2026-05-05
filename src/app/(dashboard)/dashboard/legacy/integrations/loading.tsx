import { IntegrationsPageSkeleton } from '@/components/skeletons';

/**
 * Integrations Route Loading State
 */
export default function IntegrationsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <IntegrationsPageSkeleton />
    </div>
  );
}
