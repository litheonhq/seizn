import { Suspense } from "react";
import { DevToolsClient } from "./devtools-client";

export const metadata = {
  title: "Retrieval DevTools | Seizn Dashboard",
  description: "Debug and analyze your RAG retrieval pipelines with Chrome DevTools-like experience",
};

export default function DevToolsPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        }
      >
        <DevToolsClient />
      </Suspense>
    </div>
  );
}
