import { Suspense } from 'react';
import { StatusClient } from './status-client';

export const metadata = {
  title: 'System Status | Seizn',
  description: 'Real-time system status and uptime information',
};

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <StatusClient />
      </Suspense>
    </div>
  );
}
