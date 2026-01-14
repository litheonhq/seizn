import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import MemoriesClient from "./memories-client";

export default async function MemoriesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <MemoriesClient />
    </DashboardShell>
  );
}
