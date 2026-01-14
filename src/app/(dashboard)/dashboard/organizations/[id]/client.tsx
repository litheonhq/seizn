"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
  const [activeTab, setActiveTab] = useState<"members" | "invites" | "usage" | "settings">("members");

  // Usage state
  const [usageSummary, setUsageSummary] = useState<OrgUsageSummary | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [memberUsage, setMemberUsage] = useState<MemberUsage[]>([]);
  const [usagePeriod, setUsagePeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    try {
      // Fetch organization details
      const [orgRes, membersRes, invitesRes] = await Promise.all([
        fetch(`/api/organizations?id=${organizationId}`),
        fetch(`/api/organizations/members?organization_id=${organizationId}`),
        fetch(`/api/organizations/invites?organization_id=${organizationId}`),
      ]);

      const orgData = await orgRes.json();
      const membersData = await membersRes.json();
      const invitesData = await invitesRes.json();

      if (orgData.success || orgData.organizations) {
        const org = orgData.organization || orgData.organizations?.find((o: Organization) => o.id === organizationId);
        setOrganization(org);
        setCurrentUserRole(org?.role);
      }

      if (membersData.success) {
        setMembers(membersData.members);
      }

      if (invitesData.success) {
        setInvites(invitesData.invites);
      }
    } catch (err) {
      console.error("Failed to fetch organization:", err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const fetchOrgUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    try {
      const res = await fetch(`/api/organizations/usage?organization_id=${organizationId}&period=${usagePeriod}`);
      const data = await res.json();

      if (data.success) {
        setUsageSummary(data.usage.summary);
        setDailyUsage(data.usage.daily);
        setMemberUsage(data.usage.members);
      }
    } catch (err) {
      console.error("Failed to fetch org usage:", err);
    } finally {
      setIsLoadingUsage(false);
    }
  }, [organizationId, usagePeriod]);

  useEffect(() => {
    if (activeTab === "usage") {
      fetchOrgUsage();
    }
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
        setInvites([data.invite, ...invites]);
        setInviteEmail("");
        setTimeout(() => {
          setShowInviteModal(false);
          setInviteSuccess(null);
        }, 2000);
      } else {
        setInviteError(data.error || "Failed to send invitation");
      }
    } catch (err) {
      console.error("Failed to invite:", err);
      setInviteError("Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this organization?`)) return;

    try {
      const res = await fetch(
        `/api/organizations/members?organization_id=${organizationId}&member_id=${memberId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setMembers(members.filter((m) => m.id !== memberId));
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const res = await fetch(
        `/api/organizations/invites?id=${inviteId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setInvites(invites.filter((i) => i.id !== inviteId));
      }
    } catch (err) {
      console.error("Failed to cancel invite:", err);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
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
        setMembers(
          members.map((m) =>
            m.id === memberId ? { ...m, role: newRole as Member["role"] } : m
          )
        );
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-gradient-to-r from-amber-400 to-orange-500 text-white";
      case "admin":
        return "bg-gradient-to-r from-purple-400 to-indigo-500 text-white";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Organization not found</h2>
        <p className="text-gray-500 mb-4">This organization doesn&apos;t exist or you don&apos;t have access.</p>
        <Link href="/dashboard/organizations" className="theme-gradient-btn text-white px-4 py-2 rounded-xl">
          Back to Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/dashboard/organizations"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
      >
        <BackIcon className="w-4 h-4" />
        Back to Organizations
      </Link>

      {/* Organization Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl theme-gradient-btn flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">
                {organization.name[0].toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{organization.name}</h1>
              <p className="text-gray-500">/{organization.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getRoleBadgeColor(currentUserRole || "member")}`}>
              {currentUserRole}
            </span>
            <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
              {organization.plan || "Free"} Plan
            </span>
          </div>
        </div>
      </div>

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
                : "text-gray-600 hover:bg-white/80"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? "bg-white/20" : "bg-gray-200"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Team Members</h2>
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
          <div className="divide-y divide-gray-100">
            {members.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                <div className="flex items-center gap-3">
                  {member.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                      <span className="text-gray-600 font-medium">
                        {(member.name || member.email)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{member.name || "Unknown"}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {canManageMembers && member.role !== "owner" ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
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
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Pending Invitations</h2>
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
            <div className="p-8 text-center text-gray-500">
              No pending invitations
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {invites
                .filter((i) => i.status === "pending")
                .map((invite) => (
                  <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center">
                        <MailIcon className="w-5 h-5 text-pink-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{invite.email}</p>
                        <p className="text-sm text-gray-500">
                          Expires {new Date(invite.expires_at).toLocaleDateString("ja-JP")}
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
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                      : "text-gray-600 hover:bg-white/80"
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
                <div key={i} className="glass-card rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-gray-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : usageSummary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-1">Total API Calls</p>
                <p className="text-2xl font-bold text-gray-900">{usageSummary.totalCalls.toLocaleString()}</p>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-1">Total Tokens</p>
                <p className="text-2xl font-bold text-gray-900">{usageSummary.totalTokens.toLocaleString()}</p>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-1">Estimated Cost</p>
                <p className="text-2xl font-bold text-gray-900">${usageSummary.totalCostDollars}</p>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-1">Active API Keys</p>
                <p className="text-2xl font-bold text-gray-900">{usageSummary.activeKeys}</p>
              </div>
            </div>
          ) : null}

          {/* Usage Chart */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Daily API Calls</h3>
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
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">
                          {day.date.slice(5)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                No usage data for this period
              </div>
            )}
          </div>

          {/* Member Usage Breakdown */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-4 border-b theme-border">
              <h3 className="font-semibold text-gray-900">Usage by Member</h3>
            </div>
            {memberUsage.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {memberUsage.map((member) => (
                  <div key={member.userId} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                        <span className="text-gray-600 font-medium">
                          {(member.name || member.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{member.name || member.email}</p>
                        {member.name && <p className="text-sm text-gray-500">{member.email}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{member.calls.toLocaleString()} calls</p>
                      <p className="text-sm text-gray-500">{member.tokens.toLocaleString()} tokens</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No usage data for this period
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Organization Settings</h2>
          <p className="text-gray-500">Settings management coming soon...</p>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative glass-card rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl theme-gradient-btn flex items-center justify-center shadow-lg">
                <MailIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Invite Team Member</h2>
              <p className="text-gray-500 text-sm mt-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                          ? "border-pink-400 bg-pink-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <p className="font-medium text-gray-900">{role.label}</p>
                      <p className="text-xs text-gray-500">{role.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
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
