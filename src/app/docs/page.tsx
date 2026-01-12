import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";
import { DocsClient } from "./docs-client";

export default function DocsPage() {
  return (
    <DashboardLocaleProvider>
      <DocsClient />
    </DashboardLocaleProvider>
  );
}
