import { Suspense } from "react";
import { ROIReportClient } from "./roi-report-client";

export const metadata = {
  title: "ROI Reports | Seizn Dashboard",
  description: "View cost savings and performance improvements",
};

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        }
      >
        <ROIReportClient />
      </Suspense>
    </div>
  );
}
