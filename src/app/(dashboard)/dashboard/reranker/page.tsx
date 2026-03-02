import { Suspense } from 'react';
import { RerankerClient } from './reranker-client';

export const metadata = {
  title: 'Reranker | Seizn Dashboard',
  description: 'Configure domain-adaptive reranking',
};

export default function RerankerPage() {
  return (
    <div className="min-h-screen bg-szn-bg">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-szn-accent border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <RerankerClient />
      </Suspense>
    </div>
  );
}
