import { Suspense } from "react";
import { FallDashboardClient } from "./fall-dashboard-client";

export const metadata = {
  title: "Fall Dashboard | Seizn",
  description: "Observability dashboard for traces, evaluations, and experiments",
};

export default function FallDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-gray-500">Loading dashboard...</p>
          </div>
        }
      >
        <FallDashboardClient />
      </Suspense>
    </div>
  );
}
