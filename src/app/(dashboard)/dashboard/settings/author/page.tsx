import { redirect } from "next/navigation";
import { DASHBOARD_ROUTES } from "@/lib/dashboard-routes";

export default function LegacyAuthorSettingsRedirect() {
  redirect(DASHBOARD_ROUTES.authorSettings);
}
