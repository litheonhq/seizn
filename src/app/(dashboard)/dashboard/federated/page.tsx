import { Suspense } from 'react';
import { FederatedClient } from './federated-client';

export const metadata = {
  title: 'Federated Connectors | Seizn Dashboard',
  description: 'Manage connections to external vector databases',
};

export default function FederatedPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <FederatedClient />
      </Suspense>
    </div>
  );
}
