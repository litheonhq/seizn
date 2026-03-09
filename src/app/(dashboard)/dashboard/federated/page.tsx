import { Suspense } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { getAuthOrReview } from '@/lib/auth-or-review';
import { FederatedClient } from './federated-client';

export const metadata = {
  title: 'Federated Connectors | Seizn Dashboard',
  description: 'Manage connections to external vector databases',
};

export default async function FederatedPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-szn-accent border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <FederatedClient />
      </Suspense>
    </DashboardShell>
  );
}
