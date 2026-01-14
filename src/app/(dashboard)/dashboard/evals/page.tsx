import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { DynamicEvalsClient } from "./dynamic";

export default async function EvalsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <DynamicEvalsClient />
    </DashboardShell>
  );
}
