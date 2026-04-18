import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrganizationsClient from "./client";

export const metadata: Metadata = {
  title: "Projects - Seizn Dashboard",
  description: "Manage game-title projects and studio teammates collaborating on NPC memory.",
  openGraph: {
    title: "Projects - Seizn Dashboard",
    description: "Manage game-title projects and studio teammates collaborating on NPC memory.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrganizationsPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <OrganizationsClient />
    </DashboardShell>
  );
}
