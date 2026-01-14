import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import IntegrationsClient from "./integrations-client";

export default async function IntegrationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <IntegrationsClient />
    </DashboardShell>
  );
}
