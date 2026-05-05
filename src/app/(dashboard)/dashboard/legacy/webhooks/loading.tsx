import { WebhooksPageSkeleton } from '@/components/skeletons';

/**
 * Webhooks Route Loading State
 */
export default function WebhooksLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <WebhooksPageSkeleton />
    </div>
  );
}
