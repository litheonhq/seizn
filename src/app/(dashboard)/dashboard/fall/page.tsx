import { Suspense } from "react";
import { FallDashboardClient } from "./fall-dashboard-client";

export const metadata = {
  title: "Fall Dashboard | Seizn",
  description: "Observability dashboard for traces, evaluations, and experiments",
};

export default function FallDashboardPage() {
  return (
    <div className="min-h-screen bg-[var(--ink-50)]">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--ink-900)] border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-[var(--ink-600)]">Loading dashboard...</p>
          </div>
        }
      >
        <FallDashboardClient />
      </Suspense>
    </div>
  );
}
