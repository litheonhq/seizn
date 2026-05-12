import type { NavCapabilityMap } from "@/components/dashboard/redesign/sidebar/nav-config";
import { isSuperAdminEmail } from "@/lib/admin/auth";
import { isTrack2ApiEnabled } from "@/lib/feature-flags/track-2";
import type { DashboardUser } from "@/types/dashboard";

export function getDashboardCapabilities(user: Pick<DashboardUser, "email">): NavCapabilityMap {
  return {
    track2: isTrack2ApiEnabled(),
    billing: true,
    admin: isSuperAdminEmail(user.email),
  };
}
