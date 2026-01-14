import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import WebhooksClient from "./webhooks-client";

export default async function WebhooksPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <WebhooksClient />
    </DashboardShell>
  );
}
