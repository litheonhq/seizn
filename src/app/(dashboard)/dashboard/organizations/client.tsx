"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { getErrorMessage } from "@/lib/ui-error";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  role: string;
  member_count?: number;
}

export default function OrganizationsClient() {
  const { t, locale } = useDashboardTranslation();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/organizations");
      const data = await res.json();
      if (data.success) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName, slug: newOrgSlug || undefined }),
      });
      const data = await res.json();

      if (data.success) {
        setOrganizations([{ ...data.organization, role: "owner" }, ...organizations]);
        setShowCreateModal(false);
        setNewOrgName("");
        setNewOrgSlug("");
      } else {
        setError(getErrorMessage(data.error, "Failed to create organization"));
      }
    } catch (err) {
      console.error("Failed to create organization:", err);
      setError(getErrorMessage(err, "Failed to create organization"));
    } finally {
      setIsCreating(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-szn-text-1">{t("dashboard.organizationsPage.title")}</h1>
          <p className="text-szn-text-2 mt-1">
            {t("dashboard.organizationsPage.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="theme-gradient-btn text-white px-5 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          {t("dashboard.organizationsPage.newOrganization")}
        </button>
      </div>

      {/* Organizations Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="szn-card rounded-2xl p-6 animate-pulse">
              <div className="h-6 bg-szn-surface rounded w-2/3 mb-3" />
              <div className="h-4 bg-szn-surface rounded w-1/2 mb-4" />
              <div className="h-8 bg-szn-surface rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <div className="szn-card rounded-2xl p-12">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center">
              <UsersIcon className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-szn-text-1 mb-2">
              {t("dashboard.organizationsPage.noOrgsTitle")}
            </h3>
            <p className="text-szn-text-2 mb-6">
              {t("dashboard.organizationsPage.noOrgsDesc")}
            </p>

            {/* Feature list */}
            <div className="grid grid-cols-2 gap-4 mb-8 text-left max-w-md mx-auto">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-szn-surface">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <KeyIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-szn-text-1">{t("dashboard.organizationsPage.featureSharedKeys")}</p>
                  <p className="text-xs text-szn-text-2">{t("dashboard.organizationsPage.featureSharedKeysDesc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-szn-surface">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center flex-shrink-0">
                  <TeamIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-szn-text-1">{t("dashboard.organizationsPage.featureTeamMembers")}</p>
                  <p className="text-xs text-szn-text-2">{t("dashboard.organizationsPage.featureTeamMembersDesc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-szn-surface">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-szn-accent to-szn-accent/80 flex items-center justify-center flex-shrink-0">
                  <BudgetIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-szn-text-1">{t("dashboard.organizationsPage.featureBudget")}</p>
                  <p className="text-xs text-szn-text-2">{t("dashboard.organizationsPage.featureBudgetDesc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-szn-surface">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center flex-shrink-0">
                  <AuditIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-szn-text-1">{t("dashboard.organizationsPage.featureAudit")}</p>
                  <p className="text-xs text-szn-text-2">{t("dashboard.organizationsPage.featureAuditDesc")}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="theme-gradient-btn text-white px-8 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
            >
              {t("dashboard.organizationsPage.createOrganization")}
            </button>
            <p className="mt-4 text-xs text-szn-text-3">
              {t("dashboard.organizationsPage.noOrgsExpected")}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/organizations/${org.id}`}
              className="szn-card rounded-2xl p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl theme-gradient-btn flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <span className="text-white font-bold text-lg">
                    {org.name[0].toUpperCase()}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(org.role)}`}>
                  {t(`dashboard.organizationsPage.roles.${org.role}`)}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-szn-text-1 mb-1 group-hover:theme-gradient-text transition-all">
                {org.name}
              </h3>
              <p className="text-sm text-szn-text-2 mb-4">/{org.slug}</p>
              <div className="flex items-center justify-between pt-4 border-t theme-border">
                <span className="text-xs text-szn-text-3">
                  {t("dashboard.organizationsPage.created")} {new Date(org.created_at).toLocaleDateString(locale)}
                </span>
                <span className="text-xs font-medium theme-primary">
                  {org.plan || t("dashboard.organizationsPage.freePlan")} {t("dashboard.organizationsPage.plan")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative szn-card rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-2 text-szn-text-3 hover:text-szn-text-2 hover:bg-szn-surface rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl theme-gradient-btn flex items-center justify-center shadow-lg">
                <UsersIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-szn-text-1">{t("dashboard.organizationsPage.createOrgTitle")}</h2>
              <p className="text-szn-text-2 text-sm mt-1">
                {t("dashboard.organizationsPage.createOrgDesc")}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1.5">
                  {t("dashboard.organizationsPage.orgName")}
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    if (!newOrgSlug) {
                      setNewOrgSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-")
                          .replace(/-+/g, "-")
                      );
                    }
                  }}
                  placeholder={t("dashboard.organizationsPage.orgNamePlaceholder")}
                  className="w-full px-4 py-3 bg-szn-card border border-szn-border rounded-xl text-szn-text-1 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1.5">
                  {t("dashboard.organizationsPage.urlSlug")}
                </label>
                <div className="flex items-center">
                  <span className="text-szn-text-3 text-sm mr-1">seizn.com/</span>
                  <input
                    type="text"
                    value={newOrgSlug}
                    onChange={(e) =>
                      setNewOrgSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-")
                      )
                    }
                    placeholder={t("dashboard.organizationsPage.urlSlugPlaceholder")}
                    className="flex-1 px-4 py-3 bg-szn-card border border-szn-border rounded-xl text-szn-text-1 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-3 bg-szn-surface text-szn-text-1 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
              >
                {t("dashboard.organizationsPage.cancel")}
              </button>
              <button
                onClick={handleCreateOrg}
                disabled={isCreating || !newOrgName.trim()}
                className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? t("dashboard.organizationsPage.creating") : t("dashboard.organizationsPage.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
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

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function BudgetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}

function AuditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}
