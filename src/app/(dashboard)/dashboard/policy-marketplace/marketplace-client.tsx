"use client";

import { useState, useCallback } from "react";
import {
  PolicyPackGrid,
} from "@/components/features/policy-marketplace/PolicyPackGrid";
import type { PolicyPack } from "@/components/features/policy-marketplace/PolicyPackCard";
import { useToast } from "@/contexts/ToastContext";

// Default policy packs (curated by Seizn)
const DEFAULT_PACKS: PolicyPack[] = [
  {
    id: "gdpr-essentials",
    name: "GDPR Essentials",
    description:
      "Core GDPR compliance rules: PII detection, right to be forgotten, data minimization, and consent tracking for EU data subjects.",
    category: "compliance",
    version: "1.2.0",
    author: "Seizn",
    rulesCount: 12,
    installed: false,
    popular: true,
    tags: ["gdpr", "pii", "eu", "privacy"],
  },
  {
    id: "hipaa-guard",
    name: "HIPAA Guard",
    description:
      "Healthcare data protection: PHI detection and redaction, access logging, minimum necessary standard enforcement.",
    category: "compliance",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 8,
    installed: false,
    popular: false,
    tags: ["hipaa", "healthcare", "phi"],
  },
  {
    id: "pii-shield",
    name: "PII Shield",
    description:
      "Automatically detect and redact personally identifiable information including SSN, credit cards, phone numbers, and emails.",
    category: "security",
    version: "2.0.0",
    author: "Seizn",
    rulesCount: 15,
    installed: false,
    popular: true,
    tags: ["pii", "redaction", "security"],
  },
  {
    id: "memory-hygiene",
    name: "Memory Hygiene",
    description:
      "Automated memory quality management: duplicate detection, stale fact expiration, low-confidence cleanup, and namespace organization.",
    category: "governance",
    version: "1.1.0",
    author: "Seizn",
    rulesCount: 10,
    installed: false,
    popular: true,
    tags: ["quality", "cleanup", "dedup"],
  },
  {
    id: "fact-validation",
    name: "Fact Validation",
    description:
      "Ensure memory accuracy with contradiction detection, source verification, confidence scoring, and temporal validity checks.",
    category: "governance",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 7,
    installed: false,
    popular: false,
    tags: ["validation", "accuracy", "contradictions"],
  },
  {
    id: "rate-optimizer",
    name: "Rate Optimizer",
    description:
      "Optimize API usage and costs: embedding caching, batch processing, smart deduplication, and quota management.",
    category: "performance",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 6,
    installed: false,
    popular: false,
    tags: ["performance", "cost", "optimization"],
  },
  {
    id: "agent-isolation",
    name: "Agent Isolation",
    description:
      "Multi-agent memory isolation: namespace separation, cross-agent access controls, and agent-specific retention policies.",
    category: "security",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 9,
    installed: false,
    popular: false,
    tags: ["multi-agent", "isolation", "access-control"],
  },
  {
    id: "soc2-readiness",
    name: "SOC 2 Readiness",
    description:
      "SOC 2 Type II compliance preparation: audit logging, access controls, data retention policies, and encryption verification.",
    category: "compliance",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 14,
    installed: false,
    popular: false,
    tags: ["soc2", "audit", "enterprise"],
  },
  {
    id: "temporal-governance",
    name: "Temporal Governance",
    description:
      "Time-based memory management: automatic expiration, validity windows, supersedence handling, and historical fact archival.",
    category: "governance",
    version: "1.0.0",
    author: "Seizn",
    rulesCount: 8,
    installed: false,
    popular: false,
    tags: ["temporal", "expiration", "archival"],
  },
];

export function PolicyMarketplaceClient() {
  const [packs, setPacks] = useState<PolicyPack[]>(DEFAULT_PACKS);
  const { toast } = useToast();

  const handleInstall = useCallback(
    (id: string) => {
      setPacks((prev) =>
        prev.map((p) => (p.id === id ? { ...p, installed: true } : p))
      );
      const pack = packs.find((p) => p.id === id);
      toast("success", `${pack?.name ?? "Pack"} installed successfully`);
    },
    [packs, toast]
  );

  const handleUninstall = useCallback(
    (id: string) => {
      setPacks((prev) =>
        prev.map((p) => (p.id === id ? { ...p, installed: false } : p))
      );
      const pack = packs.find((p) => p.id === id);
      toast("success", `${pack?.name ?? "Pack"} uninstalled`);
    },
    [packs, toast]
  );

  const installedCount = packs.filter((p) => p.installed).length;
  const totalRules = packs
    .filter((p) => p.installed)
    .reduce((sum, p) => sum + p.rulesCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-16.5 0c0-1.18.69-2.2 1.688-2.677L7.5 3h9l1.312 3.672A3.001 3.001 0 0121 9.349"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Policy Marketplace
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Browse and install pre-built policy packs for memory governance
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Available Packs
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {packs.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Installed
          </p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {installedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Active Rules
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {totalRules}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Categories
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            5
          </p>
        </div>
      </div>

      {/* Grid */}
      <PolicyPackGrid
        packs={packs}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
      />
    </div>
  );
}
