import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { PolicyMarketplaceClient } from "./marketplace-client";

export const metadata: Metadata = {
  title: "Policy Marketplace | Seizn Dashboard",
  description:
    "Browse and install pre-built policy packs for memory governance, compliance, and security",
  openGraph: {
    title: "Policy Marketplace | Seizn Dashboard",
    description:
      "Browse and install pre-built policy packs for memory governance, compliance, and security",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PolicyMarketplacePage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <PolicyMarketplaceClient />
    </DashboardShell>
  );
}
