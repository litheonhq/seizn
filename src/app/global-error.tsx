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
      <body className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            Something went wrong
          </h1>
          <p className="text-zinc-400 mb-8">
            We apologize for the inconvenience. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-szn-accent hover:bg-szn-accent/80 text-white font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
