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
      <body className="min-h-screen bg-szn-bg flex items-center justify-center p-4">
        <main className="max-w-md text-center">
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
            Something went wrong
          </h1>
          <p className="text-szn-text-3 mb-8">
            We apologize for the inconvenience. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-szn-accent hover:bg-szn-accent/80 text-white font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
