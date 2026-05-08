"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/feedback";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-[60vh] px-4">
      <ErrorState
        title="Something went wrong"
        body="An unexpected error occurred while loading this page."
        retry={reset}
        retryLabel="Try again"
        incidentId={error.digest}
      />
      <Link
        href="/dashboard"
        className="text-sm underline-offset-2 hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
