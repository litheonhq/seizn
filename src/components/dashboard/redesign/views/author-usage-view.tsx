'use client';

import { UsageClient } from '@/app/(dashboard)/dashboard/usage/client';

export function AuthorUsageView() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 pb-16">
        <UsageClient />
      </div>
    </main>
  );
}
