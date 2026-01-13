import { Suspense } from 'react';
import { SecurityClient } from './security-client';

export const metadata = {
  title: 'Security | Seizn Dashboard',
  description: 'Security settings and audit logs',
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <SecurityClient />
      </Suspense>
    </div>
  );
}
