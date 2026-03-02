import { Suspense } from 'react';
import { EnterpriseClient } from './enterprise-client';

export const metadata = {
  title: 'Enterprise | Seizn Dashboard',
  description: 'Enterprise SSO, SCIM, and advanced settings',
};

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-szn-bg">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-szn-accent border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <EnterpriseClient />
      </Suspense>
    </div>
  );
}
