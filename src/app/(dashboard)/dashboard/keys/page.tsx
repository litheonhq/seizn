import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ApiKeysClient from "./client";

export const metadata: Metadata = {
  title: "API Keys - Seizn Dashboard",
  description: "Create and manage your Seizn API keys. Securely access the AI memory API for your applications.",
  openGraph: {
    title: "API Keys - Seizn Dashboard",
    description: "Create and manage your Seizn API keys. Securely access the AI memory API for your applications.",
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
