import { Suspense } from "react";
import { TraceDiffClient } from "./trace-diff-client";

export const metadata = {
  title: "Compare Traces | Seizn Dashboard",
  description: "Compare two traces side by side with detailed diff analysis",
};

export default function TraceComparePage() {
  return (
    <div className="min-h-screen bg-[var(--ink-50)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--ink-900)]">Compare Traces</h1>
          <p className="text-[var(--ink-600)] mt-1">
            Analyze differences between two trace executions
          </p>
        </div>

        <Suspense
          fallback={
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-[var(--ink-900)] border-t-transparent rounded-full mx-auto" />
            </div>
          }
        >
          <TraceDiffClient />
        </Suspense>
      </div>
    </div>
  );
}
