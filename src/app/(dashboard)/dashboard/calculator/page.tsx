import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import CalculatorClient from "./calculator-client";

export default async function CalculatorPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <CalculatorClient />
    </DashboardShell>
  );
}
