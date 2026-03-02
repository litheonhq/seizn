"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  OrgIcon, ChevronDownIcon, UserIcon, SettingsIcon,
  PlusIcon, KeyIcon, UsersIcon, SearchIcon,
} from "./dashboard-icons";
import type { Organization } from "./navigation";

interface TopBarProps {
  t: (key: string) => string;
  isAuthenticated: boolean;
  onCommandPaletteOpen?: () => void;
}

export default function TopBar({ t, isAuthenticated, onCommandPaletteOpen }: TopBarProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      let cancelled = false;
      fetch("/api/dashboard/organizations")
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.success && data.organizations) {
            setOrganizations(data.organizations);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Failed to fetch orgs:", err);
        });
      return () => { cancelled = true; };
    }
  }, [isAuthenticated]);

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
    <header className="hidden lg:flex fixed top-0 right-0 left-20 z-30 h-14 items-center justify-between px-6 szn-card border-b theme-border">
      <div ref={orgDropdownRef} className="relative">
        <button
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-szn-surface-2 transition-colors text-sm font-medium text-szn-text-2"
          aria-expanded={showOrgDropdown}
          aria-haspopup="true"
          aria-label={t("dashboard.topBar.switchOrg") || "Switch organization"}
        >
          <OrgIcon className="w-4 h-4 text-szn-text-3" />
          <span>{selectedOrg?.name || t("dashboard.topBar.personal")}</span>
          <ChevronDownIcon className="w-4 h-4 text-szn-text-3" />
        </button>
        {showOrgDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-szn-card rounded-xl shadow-lg border border-szn-border py-1 animate-fade-in">
            <button
              onClick={() => { setSelectedOrg(null); setShowOrgDropdown(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-szn-surface-1 ${!selectedOrg ? "bg-szn-accent/10 text-szn-accent" : "text-szn-text-2"}`}
            >
              <UserIcon className="w-4 h-4" />
              {t("dashboard.topBar.personal")}
            </button>
            {organizations.length > 0 && <div className="border-t border-szn-border my-1" />}
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => { setSelectedOrg(org); setShowOrgDropdown(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-szn-surface-1 ${selectedOrg?.id === org.id ? "bg-szn-accent/10 text-szn-accent" : "text-szn-text-2"}`}
              >
                <OrgIcon className="w-4 h-4" />
                {org.name}
              </button>
            ))}
            <div className="border-t border-szn-border my-1" />
            <Link
              href="/dashboard/organizations"
              onClick={() => setShowOrgDropdown(false)}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-szn-text-3 hover:bg-szn-surface-1"
            >
              <SettingsIcon className="w-4 h-4" />
              {t("dashboard.topBar.manageOrgs")}
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Command Palette trigger */}
        {onCommandPaletteOpen && (
          <button
            onClick={onCommandPaletteOpen}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-szn-border hover:bg-szn-surface-2 transition-colors text-sm text-szn-text-3"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="hidden xl:inline">{t("dashboard.commandPalette.placeholder") || "Search..."}</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-szn-surface-1 rounded border border-szn-border">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>
        )}

        {/* Create dropdown */}
        <div ref={createDropdownRef} className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl theme-gradient-btn text-white text-sm font-medium shadow-md hover:shadow-lg transition-all"
            aria-expanded={showCreateDropdown}
            aria-haspopup="true"
          >
            <PlusIcon className="w-4 h-4" />
            {t("dashboard.topBar.create")}
          </button>
          {showCreateDropdown && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-szn-card rounded-xl shadow-lg border border-szn-border py-1 animate-fade-in">
              <Link
                href="/dashboard/keys"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-szn-text-2 hover:bg-szn-surface-1"
              >
                <KeyIcon className="w-4 h-4 text-szn-warning" />
                {t("dashboard.topBar.createApiKey")}
              </Link>
              <Link
                href="/dashboard/organizations"
                onClick={() => setShowCreateDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-szn-text-2 hover:bg-szn-surface-1"
              >
                <UsersIcon className="w-4 h-4 text-szn-accent" />
                {t("dashboard.topBar.createOrg")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
