/**
 * Admin gate for /admin/* pages and /api/admin/metrics.
 *
 * Locked 2026-05-07. Admin access is keyed off the SEIZN_ADMIN_EMAILS env
 * (comma-separated list). The session's user.email must match (case-
 * insensitive). For org-scoped admin features, prefer per-org permission
 * checks via hasPermission(); this gate is for SUPER admin (founder) views.
 */

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.SEIZN_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
