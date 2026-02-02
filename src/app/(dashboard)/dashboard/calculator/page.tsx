import { getAuthOrReview } from "@/lib/auth-or-review";
import DashboardShell from "@/components/dashboard/DashboardShell";
import CalculatorClient from "./calculator-client";

export default async function CalculatorPage() {
  await getAuthOrReview();

  return (
    <DashboardShell>
      <CalculatorClient />
    </DashboardShell>
  );
}
