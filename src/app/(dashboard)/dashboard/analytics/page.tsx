import { AnalyticsClient } from "./client";

export const metadata = {
  title: "Analytics | Seizn Dashboard",
  description: "Detailed usage analytics and insights for your Seizn account",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
