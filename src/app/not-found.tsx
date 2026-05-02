import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-szn-bg flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-szn-text-1 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-szn-text-2 mb-4">
          Page Not Found
        </h2>
        <p className="text-szn-text-3 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-szn-accent hover:bg-szn-accent/80 text-white font-semibold rounded-lg transition-colors"
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
