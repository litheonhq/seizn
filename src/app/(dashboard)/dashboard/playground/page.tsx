import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { PlaygroundClient } from "./client";

export default async function PlaygroundPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <PlaygroundClient />
    </DashboardShell>
  );
}
