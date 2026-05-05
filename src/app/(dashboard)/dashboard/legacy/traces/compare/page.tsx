import { Suspense } from "react";
import { TraceDiffClient } from "./trace-diff-client";

export const metadata = {
  title: "Compare Traces | Seizn Dashboard",
  description: "Compare two traces side by side with detailed diff analysis",
};

export default function TraceComparePage() {
  return (
    <div className="min-h-screen bg-szn-bg">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Suspense
          fallback={
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-szn-accent border-t-transparent rounded-full mx-auto" />
            </div>
          }
        >
          <TraceDiffClient />
        </Suspense>
      </div>
    </div>
  );
}
