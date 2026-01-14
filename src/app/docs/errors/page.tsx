import { DashboardLocaleProvider } from "@/contexts/DashboardLocaleContext";
import { ErrorDocsClient } from "./errors-client";

export const metadata = {
  title: "Error Reference | Seizn Docs",
  description: "Complete reference for Seizn API error codes, causes, and resolution guides",
};

export default function ErrorDocsPage() {
  return (
    <DashboardLocaleProvider>
      <ErrorDocsClient />
    </DashboardLocaleProvider>
  );
}
