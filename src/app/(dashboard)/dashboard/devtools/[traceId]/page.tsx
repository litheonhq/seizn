import { Suspense } from "react";
import { TraceDetailClient } from "./trace-detail-client";

export const metadata = {
  title: "Trace Detail | Retrieval DevTools",
  description: "Detailed view of a single retrieval trace",
};

interface TraceDetailPageProps {
  params: Promise<{ traceId: string }>;
}

export default async function TraceDetailPage({ params }: TraceDetailPageProps) {
  const { traceId } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        }
      >
        <TraceDetailClient traceId={traceId} />
      </Suspense>
    </div>
  );
}
