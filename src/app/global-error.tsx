"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log error to console for debugging
  console.error("Global error:", error);

  return (
    <html>
      <body className="min-h-screen bg-[var(--ink-50)] flex items-center justify-center p-4">
        <main className="max-w-md text-center">
          <h1 className="text-4xl font-bold text-[var(--ink-900)] mb-4">
            Something went wrong
          </h1>
          <p className="text-[var(--ink-500)] mb-8">
            We apologize for the inconvenience. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-white font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
