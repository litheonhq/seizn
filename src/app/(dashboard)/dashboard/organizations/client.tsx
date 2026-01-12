"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

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
        setError(data.error || "Failed to create organization");
      }
    } catch (err) {
      console.error("Failed to create organization:", err);
      setError("Failed to create organization");
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
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.organizationsPage.title")}</h1>
          <p className="text-gray-500 mt-1">
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
            <div key={i} className="glass-card rounded-2xl p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <UsersIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("dashboard.organizationsPage.noOrgsTitle")}
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            {t("dashboard.organizationsPage.noOrgsDesc")}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="theme-gradient-btn text-white px-6 py-2.5 rounded-xl font-medium"
          >
            {t("dashboard.organizationsPage.createOrganization")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/organizations/${org.id}`}
              className="glass-card rounded-2xl p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 group"
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
              <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:theme-gradient-text transition-all">
                {org.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4">/{org.slug}</p>
              <div className="flex items-center justify-between pt-4 border-t theme-border">
                <span className="text-xs text-gray-400">
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
          <div className="relative glass-card rounded-3xl p-8 w-full max-w-md shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl theme-gradient-btn flex items-center justify-center shadow-lg">
                <UsersIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("dashboard.organizationsPage.createOrgTitle")}</h2>
              <p className="text-gray-500 text-sm mt-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t("dashboard.organizationsPage.urlSlug")}
                </label>
                <div className="flex items-center">
                  <span className="text-gray-400 text-sm mr-1">seizn.com/</span>
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
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
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
