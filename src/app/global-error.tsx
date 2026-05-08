"use client";

import { ErrorState } from "@/components/feedback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "var(--ink-50)" }}
      >
        <main className="w-full max-w-lg">
          <ErrorState
            title="Something went wrong"
            body="We apologize for the inconvenience. Our team has been notified."
            retry={reset}
            retryLabel="Try again"
            incidentId={error.digest}
          />
        </main>
      </body>
    </html>
  );
}
