import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AnalyticsClient } from "./client";

export const metadata = {
  title: "Analytics | Seizn Dashboard",
  description: "Detailed usage analytics and insights for your Seizn account",
};

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <AnalyticsClient />
    </DashboardShell>
  );
}
