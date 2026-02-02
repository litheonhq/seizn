import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import MemoriesClient from "./memories-client";

export const metadata: Metadata = {
  title: "Memories - Seizn Dashboard",
  description: "Browse and manage your AI memories. View, search, and organize stored context for your applications.",
  openGraph: {
    title: "Memories - Seizn Dashboard",
    description: "Browse and manage your AI memories. View, search, and organize stored context for your applications.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MemoriesPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <MemoriesClient />
    </DashboardShell>
  );
}
