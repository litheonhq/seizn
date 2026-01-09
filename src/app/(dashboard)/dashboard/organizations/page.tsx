import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OrganizationsClient from "./client";

export default async function OrganizationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <OrganizationsClient />
    </DashboardShell>
  );
}
