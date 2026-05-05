import { OrganizationsPageSkeleton } from '@/components/skeletons';

/**
 * Organizations Route Loading State
 */
export default function OrganizationsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <OrganizationsPageSkeleton />
    </div>
  );
}
