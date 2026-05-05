import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { isAuthorUiAccessAllowed } from "@/lib/author/ui/route";
import DashboardOverviewClient from "./overview-client";

export const metadata: Metadata = {
  title: "Dashboard - Seizn",
  description: "Seizn workspace overview.",
  openGraph: {
    title: "Dashboard - Seizn",
    description: "Seizn workspace overview.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const { user, isAuthenticated } = await getAuthOrReview();

  if (
    isAuthenticated &&
    user &&
    typeof user.id === "string" &&
    isAuthorUiAccessAllowed({ id: user.id, email: user.email ?? undefined })
  ) {
    redirect("/dashboard/author");
  }

  return (
    <DashboardShell>
      <DashboardOverviewClient user={user} />
    </DashboardShell>
  );
}
