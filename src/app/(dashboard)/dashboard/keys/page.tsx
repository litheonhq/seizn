import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DASHBOARD_ROUTES } from "@/lib/dashboard-routes";

export const metadata: Metadata = {
  title: "API Keys - Seizn Dashboard",
  description: "Create and manage API keys for NPC memory runtimes, game servers, and studio tools.",
  openGraph: {
    title: "API Keys - Seizn Dashboard",
    description: "Create and manage API keys for NPC memory runtimes, game servers, and studio tools.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ApiKeysPage() {
  redirect(DASHBOARD_ROUTES.apiKeys);
}
