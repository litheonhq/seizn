import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--ink-50)] flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-[var(--ink-900)] mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-[var(--ink-600)] mb-4">
          Page Not Found
        </h2>
        <p className="text-[var(--ink-500)] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-white font-semibold rounded-lg transition-colors"
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
