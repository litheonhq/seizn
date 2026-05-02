"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";
import { formatDate } from "@/lib/format-date";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  settings?: Record<string, unknown>;
}

interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "member";
  joined_at: string;
  avatar?: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface OrgUsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostDollars: string;
  totalErrors: number;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
  activeKeys: number;
  memberCount: number;
}

interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

interface MemberUsage {
  userId: string;
  email: string;
  name: string | null;
  calls: number;
  tokens: number;
  cost: number;
}

export default function OrganizationDetailClient({
  organizationId,
}: {
  organizationId: string;
}) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "invites" | "usage" | "settings">("members");

  // Usage state
  const [usageSummary, setUsageSummary] = useState<OrgUsageSummary | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [memberUsage, setMemberUsage] = useState<MemberUsage[]>([]);
  const [usagePeriod, setUsagePeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const orgRequestGuardRef = useRef(createLatestRequestGuard());
  const usageRequestGuardRef = useRef(createLatestRequestGuard());

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    const request = orgRequestGuardRef.current.begin();
    setPageError(null);
    try {
      const [orgResult, membersResult, invitesResult] = await Promise.allSettled([
        fetch(`/api/organizations?id=${organizationId}`, { signal: request.signal }).then((res) => res.json()),
        fetch(`/api/organizations/members?organization_id=${organizationId}`, { signal: request.signal }).then((res) => res.json()),
        fetch(`/api/organizations/invites?organization_id=${organizationId}`, { signal: request.signal }).then((res) => res.json()),
      ]);

      if (!orgRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      let failedCount = 0;

      if (orgResult.status === "fulfilled" && (orgResult.value.success || orgResult.value.organizations)) {
        const org = orgResult.value.organization || orgResult.value.organizations?.find((o: Organization) => o.id === organizationId);
        setOrganization(org);
        setCurrentUserRole(org?.role);
      } else if (
        (orgResult.status === "fulfilled" && !(orgResult.value.success || orgResult.value.organizations)) ||
        (orgResult.status === "rejected" && !isAbortError(orgResult.reason))
      ) {
        failedCount += 1;
      }

      if (membersResult.status === "fulfilled" && membersResult.value.success) {
        setMembers(membersResult.value.members);
      } else if (
        (membersResult.status === "fulfilled" && !membersResult.value.success) ||
        (membersResult.status === "rejected" && !isAbortError(membersResult.reason))
      ) {
        failedCount += 1;
      }

      if (invitesResult.status === "fulfilled" && invitesResult.value.success) {
        setInvites(invitesResult.value.invites);
      } else if (
        (invitesResult.status === "fulfilled" && !invitesResult.value.success) ||
        (invitesResult.status === "rejected" && !isAbortError(invitesResult.reason))
      ) {
        failedCount += 1;
      }

      if (failedCount > 0) {
        setPageError("Some organization data could not be refreshed.");
      }
    } catch (err) {
      if (!isAbortError(err) && orgRequestGuardRef.current.isCurrent(request.id)) {
        setPageError(getErrorMessage(err, "Failed to load organization."));
      }
    } finally {
      if (orgRequestGuardRef.current.isCurrent(request.id)) {
        setIsLoading(false);
        orgRequestGuardRef.current.finish(request.id);
      }
    }
  }, [organizationId]);

  useEffect(() => {
    const requestGuard = orgRequestGuardRef.current;
    fetchOrganization();
    return () => requestGuard.cancel();
  }, [fetchOrganization]);

  const fetchOrgUsage = useCallback(async () => {
    const request = usageRequestGuardRef.current.begin();
    setIsLoadingUsage(true);
    setUsageError(null);
    try {
      const res = await fetch(`/api/organizations/usage?organization_id=${organizationId}&period=${usagePeriod}`, {
        signal: request.signal,
      });
      const data = await res.json();

      if (!usageRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      if (data.success) {
        setUsageSummary(data.usage.summary);
        setDailyUsage(data.usage.daily);
        setMemberUsage(data.usage.members);
      } else {
        setUsageError(getErrorMessage(data.error, "Failed to load usage data."));
      }
    } catch (err) {
      if (!isAbortError(err) && usageRequestGuardRef.current.isCurrent(request.id)) {
        setUsageError(getErrorMessage(err, "Failed to load usage data."));
      }
    } finally {
      if (usageRequestGuardRef.current.isCurrent(request.id)) {
        setIsLoadingUsage(false);
        usageRequestGuardRef.current.finish(request.id);
      }
    }
  }, [organizationId, usagePeriod]);

  useEffect(() => {
    const requestGuard = usageRequestGuardRef.current;
    if (activeTab === "usage") {
      void fetchOrgUsage();
    }
    return () => requestGuard.cancel();
  }, [activeTab, fetchOrgUsage]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await fetch("/api/organizations/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setInviteSuccess(`Invitation sent to ${inviteEmail}`);
        setInvites((currentInvites) => [data.invite, ...currentInvites]);
        setInviteEmail("");
        setTimeout(() => {
          setShowInviteModal(false);
          setInviteSuccess(null);
        }, 2000);
      } else {
        setInviteError(getErrorMessage(data.error, "Failed to send invitation"));
      }
    } catch (err) {
      setInviteError(getErrorMessage(err, "Failed to send invitation"));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this organization?`)) return;
    setPageError(null);

    try {
      const res = await fetch(
        `/api/organizations/members?organization_id=${organizationId}&member_id=${memberId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setMembers((currentMembers) => currentMembers.filter((m) => m.id !== memberId));
      } else {
        setPageError(getErrorMessage(data.error, "Failed to remove member."));
      }
    } catch (err) {
      setPageError(getErrorMessage(err, "Failed to remove member."));
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setPageError(null);
    try {
      const res = await fetch(
        `/api/organizations/invites?id=${inviteId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setInvites((currentInvites) => currentInvites.filter((i) => i.id !== inviteId));
      } else {
        setPageError(getErrorMessage(data.error, "Failed to cancel invite."));
      }
    } catch (err) {
      setPageError(getErrorMessage(err, "Failed to cancel invite."));
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setPageError(null);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          member_id: memberId,
          role: newRole,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMembers((currentMembers) =>
          currentMembers.map((m) =>
            m.id === memberId ? { ...m, role: newRole as Member["role"] } : m
          )
        );
      } else {
        setPageError(getErrorMessage(data.error, "Failed to update role."));
      }
    } catch (err) {
      setPageError(getErrorMessage(err, "Failed to update role."));
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-gradient-to-r from-amber-400 to-orange-500 text-white";
      case "admin":
        return "bg-gradient-to-r from-purple-400 to-indigo-500 text-white";
      default:
        return "bg-szn-surface text-szn-text-2";
    }
  };

  const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="szn-card rounded-lg p-6 animate-pulse">
          <div className="h-8 bg-szn-surface-1 rounded w-1/3 mb-4" />
          <div className="h-4 bg-szn-surface rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="szn-card rounded-lg p-12 text-center">
        <h2 className="text-xl font-semibold text-szn-text-1 mb-2">
          {pageError ? "Failed to load organization" : "Organization not found"}
        </h2>
        <p className="text-szn-text-2 mb-4">
          {pageError || "This organization doesn't exist or you don't have access."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {pageError && (
            <button onClick={() => void fetchOrganization()} className="px-4 py-2 rounded-xl bg-szn-surface text-szn-text-1 hover:bg-szn-surface-1">
              Retry
            </button>
          )}
          <Link href="/dashboard/organizations" className="theme-gradient-btn text-white px-4 py-2 rounded-xl">
            Back to Organizations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/dashboard/organizations"
        className="inline-flex items-center gap-2 text-szn-text-2 hover:text-szn-text-2 transition-colors"
      >
        <BackIcon className="w-4 h-4" />
        Back to Organizations
      </Link>

      {/* Organization Header */}
      <div className="szn-card rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg theme-gradient-btn flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">
                {organization.name[0].toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-szn-text-1">{organization.name}</h1>
              <p className="text-szn-text-2">/{organization.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getRoleBadgeColor(currentUserRole || "member")}`}>
              {currentUserRole}
            </span>
            <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-szn-surface text-szn-text-2">
              {organization.plan || "Free"} Plan
            </span>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {pageError}
        </div>
      )}

      {usageError && activeTab === "usage" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {usageError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/50 rounded-xl w-fit">
        {[
          { id: "members", label: "Members", count: members.length },
          { id: "invites", label: "Invites", count: invites.filter((i) => i.status === "pending").length },
          { id: "usage", label: "Usage" },
          { id: "settings", label: "Settings" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "theme-gradient-btn text-white shadow-md"
                : "text-szn-text-2 hover:bg-white/80"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? "bg-white/20" : "bg-szn-surface-1"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="szn-card rounded-lg overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-szn-text-1">Team Members</h2>
            {canManageMembers && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="theme-gradient-btn text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Invite Member
              </button>
            )}
          </div>
          <div className="divide-y divide-szn-border">
            {members.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                <div className="flex items-center gap-3">
                  {member.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-szn-surface-1 to-szn-surface-2 flex items-center justify-center">
                      <span className="text-szn-text-2 font-medium">
                        {(member.name || member.email)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-szn-text-1">{member.name || "Unknown"}</p>
                    <p className="text-sm text-szn-text-2">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {canManageMembers && member.role !== "owner" ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      className="px-3 py-1.5 bg-white border border-szn-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-szn-accent/40"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                      {member.role}
                    </span>
                  )}
                  {canManageMembers && member.role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.email)}
                      className="p-2 text-szn-text-3 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invites Tab */}
      {activeTab === "invites" && (
        <div className="szn-card rounded-lg overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-szn-text-1">Pending Invitations</h2>
            {canManageMembers && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="theme-gradient-btn text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Send Invite
              </button>
            )}
          </div>
          {invites.filter((i) => i.status === "pending").length === 0 ? (
            <div className="p-8 text-center text-szn-text-2">
              No pending invitations
            </div>
          ) : (
            <div className="divide-y divide-szn-border">
              {invites
                .filter((i) => i.status === "pending")
                .map((invite) => (
                  <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-violet-200 flex items-center justify-center">
                        <MailIcon className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <p className="font-medium text-szn-text-1">{invite.email}</p>
                        <p className="text-sm text-szn-text-2">
                          Expires {formatDate(invite.expires_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(invite.role)}`}>
                        {invite.role}
                      </span>
                      {canManageMembers && (
                        <button
                          onClick={() => handleCancelInvite(invite.id)}
                          className="p-2 text-szn-text-3 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          {/* Period selector */}
          <div className="flex justify-end">
            <div className="flex gap-1 p-1 bg-white/50 rounded-lg">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setUsagePeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    usagePeriod === p
                      ? "theme-gradient-btn text-white shadow-md"
                      : "text-szn-text-2 hover:bg-white/80"
                  }`}
                >
                  {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>
          </div>

          {/* KPI Cards */}
          {isLoadingUsage ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="szn-card rounded-lg p-5 animate-pulse">
                  <div className="h-4 bg-szn-surface-1 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-szn-surface rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : usageSummary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="szn-card rounded-lg p-5">
                <p className="text-sm text-szn-text-2 mb-1">Total API Calls</p>
                <p className="text-2xl font-bold text-szn-text-1">{usageSummary.totalCalls.toLocaleString()}</p>
              </div>
              <div className="szn-card rounded-lg p-5">
                <p className="text-sm text-szn-text-2 mb-1">Total Tokens</p>
                <p className="text-2xl font-bold text-szn-text-1">{usageSummary.totalTokens.toLocaleString()}</p>
              </div>
              <div className="szn-card rounded-lg p-5">
                <p className="text-sm text-szn-text-2 mb-1">Estimated Cost</p>
                <p className="text-2xl font-bold text-szn-text-1">${usageSummary.totalCostDollars}</p>
              </div>
              <div className="szn-card rounded-lg p-5">
                <p className="text-sm text-szn-text-2 mb-1">Active API Keys</p>
                <p className="text-2xl font-bold text-szn-text-1">{usageSummary.activeKeys}</p>
              </div>
            </div>
          ) : null}

          {/* Usage Chart */}
          <div className="szn-card rounded-lg p-6">
            <h3 className="font-semibold text-szn-text-1 mb-4">Daily API Calls</h3>
            {dailyUsage.length > 0 ? (
              <div className="h-48 flex items-end gap-1">
                {dailyUsage.map((day, i) => {
                  const maxCalls = Math.max(...dailyUsage.map((d) => d.calls));
                  const height = maxCalls > 0 ? (day.calls / maxCalls) * 100 : 0;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full rounded-t theme-gradient-btn transition-all hover:opacity-80"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${day.date}: ${day.calls} calls`}
                      />
                      {i % Math.ceil(dailyUsage.length / 7) === 0 && (
                        <span className="text-[10px] text-szn-text-3 truncate w-full text-center">
                          {day.date.slice(5)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-szn-text-3">
                No usage data for this period
              </div>
            )}
          </div>

          {/* Member Usage Breakdown */}
          <div className="szn-card rounded-lg overflow-hidden">
            <div className="p-4 border-b theme-border">
              <h3 className="font-semibold text-szn-text-1">Usage by Member</h3>
            </div>
            {memberUsage.length > 0 ? (
              <div className="divide-y divide-szn-border">
                {memberUsage.map((member) => (
                  <div key={member.userId} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-szn-surface-1 to-szn-surface-2 flex items-center justify-center">
                        <span className="text-szn-text-2 font-medium">
                          {(member.name || member.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-szn-text-1">{member.name || member.email}</p>
                        {member.name && <p className="text-sm text-szn-text-2">{member.email}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-szn-text-1">{member.calls.toLocaleString()} calls</p>
                      <p className="text-sm text-szn-text-2">{member.tokens.toLocaleString()} tokens</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-szn-text-2">
                No usage data for this period
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <OrgSettingsTab
          organization={organization}
          canManage={canManageMembers}
          onUpdate={(updated) => setOrganization({ ...organization, ...updated })}
        />
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative szn-card rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 p-2 text-szn-text-3 hover:text-szn-text-2 hover:bg-szn-surface rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-lg theme-gradient-btn flex items-center justify-center shadow-lg">
                <MailIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-szn-text-1">Invite Team Member</h2>
              <p className="text-szn-text-2 text-sm mt-1">
                Send an invitation to join {organization.name}
              </p>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl text-green-600 text-sm flex items-center gap-2">
                <CheckIcon className="w-5 h-5" />
                {inviteSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-3 bg-white border border-szn-border rounded-xl text-szn-text-1 placeholder-szn-text-3 focus:outline-none focus:ring-2 focus:ring-szn-accent/40 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "member", label: "Member", desc: "Can view and use" },
                    { value: "admin", label: "Admin", desc: "Can manage team" },
                  ].map((role) => (
                    <button
                      key={role.value}
                      onClick={() => setInviteRole(role.value as typeof inviteRole)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        inviteRole === role.value
                          ? "border-szn-accent bg-szn-accent/5"
                          : "border-szn-border hover:border-szn-border"
                      }`}
                    >
                      <p className="font-medium text-szn-text-1">{role.label}</p>
                      <p className="text-xs text-szn-text-2">{role.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-3 bg-szn-surface text-szn-text-2 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail.trim()}
                className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Organization Settings Tab
// =========================================================================

function OrgSettingsTab({
  organization,
  canManage,
  onUpdate,
}: {
  organization: Organization;
  canManage: boolean;
  onUpdate: (updates: Partial<Organization>) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const hasChanges = name !== organization.name || slug !== organization.slug;

  const handleSave = async () => {
    if (!hasChanges || !canManage) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: organization.id,
          name: name.trim(),
          slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        }),
      });

      const data = await res.json();

      if (data.success) {
        onUpdate({ name: name.trim(), slug: slug.trim() });
        setSaveMessage({ type: "success", text: "Settings saved successfully" });
      } else {
        setSaveMessage({ type: "error", text: getErrorMessage(data.error, "Failed to save settings") });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== organization.name) return;

    try {
      const res = await fetch(`/api/organizations?id=${organization.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        router.push("/dashboard/organizations");
      } else {
        setSaveMessage({
          type: "error",
          text: getErrorMessage(data.error, "Failed to delete organization"),
        });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Failed to delete organization" });
    }
  };

  return (
    <div className="space-y-6">
      {/* General Settings */}
      <div className="szn-card rounded-lg p-6">
        <h2 className="font-semibold text-szn-text-1 mb-6">General Settings</h2>

        {saveMessage && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            saveMessage.type === "success"
              ? "bg-green-50 border border-green-100 text-green-600"
              : "bg-red-50 border border-red-100 text-red-600"
          }`}>
            {saveMessage.text}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              className="w-full px-4 py-3 bg-white border border-szn-border rounded-xl text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent/40 focus:border-transparent disabled:bg-szn-surface disabled:text-szn-text-2 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
              URL Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-szn-text-3 text-sm">seizn.com/org/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                disabled={!canManage}
                className="flex-1 px-4 py-3 bg-white border border-szn-border rounded-xl text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent/40 focus:border-transparent disabled:bg-szn-surface disabled:text-szn-text-2 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
              Plan
            </label>
            <div className="px-4 py-3 bg-szn-surface border border-szn-border rounded-xl text-szn-text-2">
              {organization.plan || "Free"} Plan
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-szn-text-2 mb-1.5">
              Organization ID
            </label>
            <div className="px-4 py-3 bg-szn-surface border border-szn-border rounded-xl text-szn-text-3 font-mono text-sm">
              {organization.id}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="mt-6 pt-6 border-t border-szn-border">
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="theme-gradient-btn text-white px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      {canManage && (
        <div className="szn-card rounded-lg p-6 border-2 border-red-100">
          <h2 className="font-semibold text-red-600 mb-2">Danger Zone</h2>
          <p className="text-sm text-szn-text-2 mb-4">
            Deleting an organization is permanent and cannot be undone. All members will lose access and all data will be removed.
          </p>

          {showDeleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-szn-text-2">
                Type <strong>{organization.name}</strong> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={organization.name}
                className="w-full px-4 py-3 bg-white border border-red-200 rounded-xl text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-red-300 transition-all"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                  className="px-4 py-2.5 bg-szn-surface text-szn-text-2 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== organization.name}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 transition-colors"
                >
                  Delete Organization
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2.5 border-2 border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
            >
              Delete Organization
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Icons
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
