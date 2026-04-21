import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { UsageClient } from "./client";
import { OveragePanel } from "../billing/overage-panel";

export const metadata: Metadata = {
  title: "Usage - Seizn Dashboard",
  description: "Monitor your API usage, view analytics, and track your Seizn account activity.",
  openGraph: {
    title: "Usage - Seizn Dashboard",
    description: "Monitor your API usage, view analytics, and track your Seizn account activity.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function UsagePage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <OveragePanel />
      <UsageClient />
    </DashboardShell>
  );
}
