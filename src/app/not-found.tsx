import Link from "next/link";
import { ErrorState } from "@/components/feedback";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--ink-50)" }}
    >
      <div className="w-full max-w-lg">
        <ErrorState
          title="Page not found"
          body={
            <>
              The page you&apos;re looking for doesn&apos;t exist or has been moved.{" "}
              <Link href="/" className="underline underline-offset-2">
                Go home
              </Link>
              .
            </>
          }
        />
      </div>
    </main>
  );
}
