import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import GovernanceClient from "./governance-client";

export default async function GovernancePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <GovernanceClient />
    </DashboardShell>
  );
}
