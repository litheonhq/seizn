"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  OrgIcon, ChevronDownIcon, UserIcon, SettingsIcon,
  PlusIcon, KeyIcon, UsersIcon, SearchIcon,
} from "./dashboard-icons";
import type { Organization } from "./navigation";
import { useToast } from "@/contexts/ToastContext";
import { getErrorMessage } from "@/lib/ui-error";

interface TopBarProps {
  t: (key: string) => string;
  isAuthenticated: boolean;
  onCommandPaletteOpen?: () => void;
}

type OrganizationsChangedDetail = {
  organization?: Organization;
};

export default function TopBar({ t, isAuthenticated, onCommandPaletteOpen }: TopBarProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);
  const organizationLoadRequestIdRef = useRef(0);
  const { toast } = useToast();

  const selectedOrg =
    organizations.find((organization) => organization.id === activeOrganizationId) ?? null;

  const loadOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganizations([]);
      setActiveOrganizationId(null);
      return;
    }

    const requestId = ++organizationLoadRequestIdRef.current;
    const response = await fetch("/api/dashboard/organizations", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.success || !Array.isArray(data.organizations)) {
      throw new Error(getErrorMessage(data?.error, "Failed to load organizations"));
    }

    if (requestId !== organizationLoadRequestIdRef.current) {
      return;
    }

    setOrganizations(data.organizations);
    setActiveOrganizationId(
      typeof data.activeOrganizationId === "string" && data.activeOrganizationId.trim()
        ? data.activeOrganizationId
        : null
    );
  }, [isAuthenticated]);

  const switchOrganization = useCallback(
    async (organization: Organization | null) => {
      if (isSwitchingOrganization) {
        return;
      }

      const nextOrganizationId = organization?.id ?? null;
      if (nextOrganizationId === activeOrganizationId) {
        setShowOrgDropdown(false);
        return;
      }

      const previousOrganizationId = activeOrganizationId;

      organizationLoadRequestIdRef.current += 1;
      setActiveOrganizationId(nextOrganizationId);
      setShowOrgDropdown(false);
      setIsSwitchingOrganization(true);

      try {
        const response = await fetch("/api/profile/organization", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: nextOrganizationId }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(getErrorMessage(data?.error, "Failed to switch organization"));
        }

        const persistedOrganizationId =
          typeof data.organizationId === "string" && data.organizationId.trim()
            ? data.organizationId
            : null;

        setActiveOrganizationId(persistedOrganizationId);
        window.dispatchEvent(
          new CustomEvent("seizn:active-organization-changed", {
            detail: { organizationId: persistedOrganizationId },
          })
        );
      } catch (error) {
        setActiveOrganizationId(previousOrganizationId);
        toast("error", getErrorMessage(error, "Failed to switch organization"));
      } finally {
        setIsSwitchingOrganization(false);
      }
    },
    [activeOrganizationId, isSwitchingOrganization, toast]
  );

  useEffect(() => {
    let cancelled = false;

    const refreshOrganizations = async () => {
      try {
        await loadOrganizations();
      } catch (error) {
        if (cancelled || !isAuthenticated) {
          return;
        }

        toast("error", getErrorMessage(error, "Failed to load organizations"));
      }
    };

    void refreshOrganizations();

    const handleOrganizationsChanged = (event: Event) => {
      const detail = (event as CustomEvent<OrganizationsChangedDetail>).detail;
      const createdOrganization = detail?.organization;

      if (
        createdOrganization &&
        typeof createdOrganization.id === "string" &&
        typeof createdOrganization.name === "string" &&
        typeof createdOrganization.slug === "string"
      ) {
        setOrganizations((previousOrganizations) => {
          const nextOrganizations = previousOrganizations.filter(
            (organization) => organization.id !== createdOrganization.id
          );
          return [createdOrganization, ...nextOrganizations];
        });
        setActiveOrganizationId((previousOrganizationId) =>
          previousOrganizationId ?? createdOrganization.id
        );
        return;
      }

      void refreshOrganizations();
    };

    window.addEventListener("seizn:organizations-changed", handleOrganizationsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("seizn:organizations-changed", handleOrganizationsChanged);
    };
  }, [isAuthenticated, loadOrganizations, toast]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
      }
      if (createDropdownRef.current && !createDropdownRef.current.contains(e.target as Node)) {
        setShowCreateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="hidden lg:flex fixed top-0 right-0 left-[68px] z-30 h-14 items-center justify-between px-6 bg-szn-bg/95 backdrop-blur-xl border-b border-szn-border-subtle">
      <div ref={orgDropdownRef} className="relative">
        <button
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          disabled={isSwitchingOrganization}
          data-testid="org-switcher-button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-szn-surface-1 transition-colors text-[13px] font-medium text-szn-text-1"
          aria-expanded={showOrgDropdown}
          aria-haspopup="true"
          aria-label={t("dashboard.topBar.switchOrg") || "Switch organization"}
        >
          <span className="szn-signal-dot" aria-hidden="true" />
          <OrgIcon className="w-4 h-4 text-szn-text-3" />
          <span>{selectedOrg?.name || t("dashboard.topBar.personal")}</span>
          <ChevronDownIcon className="w-4 h-4 text-szn-text-3" />
        </button>
        {showOrgDropdown && (
          <div className="absolute top-full left-0 mt-2 w-60 bg-szn-card rounded-lg border border-szn-border-subtle py-1 animate-dropdown-in" style={{ boxShadow: "var(--szn-shadow-md)" }}>
            <button
              onClick={() => { void switchOrganization(null); }}
              disabled={isSwitchingOrganization}
              data-testid="org-option-personal"
              className={`w-full flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-szn-surface-1 disabled:opacity-60 ${!selectedOrg ? "bg-szn-signal-soft text-szn-signal" : "text-szn-text-2"}`}
            >
              <UserIcon className="w-4 h-4" />
              {t("dashboard.topBar.personal")}
            </button>
            {organizations.length > 0 && <div className="border-t border-szn-border-subtle my-1" />}
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => { void switchOrganization(org); }}
                disabled={isSwitchingOrganization}
                data-testid={`org-option-${org.id}`}
                className={`w-full flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-szn-surface-1 disabled:opacity-60 ${selectedOrg?.id === org.id ? "bg-szn-signal-soft text-szn-signal" : "text-szn-text-2"}`}
              >
                <OrgIcon className="w-4 h-4" />
                {org.name}
              </button>
            ))}
            <div className="border-t border-szn-border-subtle my-1" />
            <Link
              href="/dashboard/organizations"
              onClick={() => setShowOrgDropdown(false)}
              className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-szn-text-3 hover:bg-szn-surface-1 hover:text-szn-text-1"
            >
              <SettingsIcon className="w-4 h-4" />
              {t("dashboard.topBar.manageOrgs")}
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Live runtime status — mono micro-strip */}
        <div className="hidden xl:flex items-center gap-5 pr-3 mr-1 border-r border-szn-border-subtle">
          <div className="flex items-baseline gap-1.5">
            <span className="szn-eyebrow">P95</span>
            <span className="font-mono text-[12px] text-szn-text-1 tabular-nums">142ms</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="szn-eyebrow">CACHE</span>
            <span className="font-mono text-[12px] text-szn-text-1 tabular-nums">96.7%</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="szn-eyebrow">LIVE</span>
            <span className="font-mono text-[12px] text-szn-signal tabular-nums">8,409</span>
          </div>
        </div>

        {/* Command Palette trigger */}
        {onCommandPaletteOpen && (
          <button
            onClick={onCommandPaletteOpen}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-szn-border-subtle hover:border-szn-signal-line hover:bg-szn-signal-soft transition-colors duration-150 text-[13px] text-szn-text-3"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="hidden xl:inline">{t("dashboard.commandPalette.placeholder") || "Search…"}</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-szn-surface-1 rounded border border-szn-border-subtle text-szn-text-2">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>
        )}

        {/* Create dropdown */}
        <div ref={createDropdownRef} className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-szn-signal text-szn-signal-fg text-[13px] font-medium hover:bg-szn-signal-hover transition-colors duration-150"
            aria-expanded={showCreateDropdown}
            aria-haspopup="true"
          >
            <PlusIcon className="w-4 h-4" />
            {t("dashboard.topBar.create")}
          </button>
          {showCreateDropdown && (
            <div className="absolute top-full right-0 mt-2 w-52 bg-szn-card rounded-lg border border-szn-border-subtle py-1 animate-dropdown-in" style={{ boxShadow: "var(--szn-shadow-md)" }}>
              <Link
                href="/dashboard/keys"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-szn-text-2 hover:bg-szn-surface-1 hover:text-szn-text-1"
              >
                <KeyIcon className="w-4 h-4 text-szn-warning" />
                {t("dashboard.topBar.createApiKey")}
              </Link>
              <Link
                href="/dashboard/organizations"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-szn-text-2 hover:bg-szn-surface-1 hover:text-szn-text-1"
              >
                <UsersIcon className="w-4 h-4 text-szn-signal" />
                {t("dashboard.topBar.createOrg")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
