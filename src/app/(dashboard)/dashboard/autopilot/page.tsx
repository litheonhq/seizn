import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import AutopilotClient from "./autopilot-client";

export default async function AutopilotPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <AutopilotClient />
    </DashboardShell>
  );
}
