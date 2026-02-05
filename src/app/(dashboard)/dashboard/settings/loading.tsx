import { SettingsPageSkeleton } from '@/components/skeletons';

/**
 * Settings Route Loading State
 */
export default function SettingsLoading() {
  return (
    <div className="container mx-auto py-6 px-4">
      <SettingsPageSkeleton />
    </div>
  );
}
