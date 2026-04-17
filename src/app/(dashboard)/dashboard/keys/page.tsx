import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ApiKeysClient from "./client";

export const metadata: Metadata = {
  title: "API Keys - Seizn Dashboard",
  description: "Create and manage API keys for NPC memory runtimes, game servers, and studio tools.",
  openGraph: {
    title: "API Keys - Seizn Dashboard",
    description: "Create and manage API keys for NPC memory runtimes, game servers, and studio tools.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ApiKeysPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <ApiKeysClient />
    </DashboardShell>
  );
}
