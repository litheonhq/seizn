import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { UsageDashboard } from "@/components/spring/usage-dashboard";

export const metadata = {
  title: "Usage Dashboard - Seizn Spring",
  description: "Track your AI usage and remaining quotas",
};

export default async function UsagePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/spring" className="flex items-center gap-2">
              <span className="text-2xl">🌸</span>
              <span className="font-semibold text-gray-900">Seizn Spring</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/spring/chat"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Chat
              </Link>
              <Link
                href="/spring/usage"
                className="text-sm font-medium text-pink-600"
              >
                Usage
              </Link>
              <Link
                href="/spring/pricing"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Pricing
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <UsageDashboard />
      </main>
    </div>
  );
}
