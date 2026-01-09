import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ApiKeysClient from "./client";

export default async function ApiKeysPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <ApiKeysClient />
    </DashboardShell>
  );
}
