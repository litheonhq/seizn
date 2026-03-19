"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-16 h-16 mb-6 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-szn-text-1 mb-2">
        Something went wrong
      </h2>
      <p className="text-szn-text-2 mb-6 max-w-md">
        An unexpected error occurred while loading this page.
        {error.digest && (
          <span className="block mt-1 text-xs text-szn-text-3">
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-gradient-to-r from-szn-accent to-szn-accent/80 text-white rounded-xl font-medium hover:opacity-90 transition-colors"
        >
          Try Again
        </button>
        <Link
          href="/dashboard"
          className="px-6 py-2.5 border border-szn-border text-szn-text-1 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
