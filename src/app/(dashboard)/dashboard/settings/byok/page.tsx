import { redirect } from "next/navigation";
import { DASHBOARD_ROUTES } from "@/lib/dashboard-routes";

export default function LegacyByokSettingsRedirect() {
  redirect(DASHBOARD_ROUTES.authorSettingsByok);
}
