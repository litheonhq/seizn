import { getAuthOrReview } from "@/lib/auth-or-review";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrganizationsClient from "./client";

export const metadata: Metadata = {
  title: "Organizations - Seizn Dashboard",
  description: "Manage your organizations and team members. Collaborate on AI memory projects with your team.",
  openGraph: {
    title: "Organizations - Seizn Dashboard",
    description: "Manage your organizations and team members. Collaborate on AI memory projects with your team.",
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
