"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { formatDate } from "@/lib/format-date";
import { getErrorMessage } from "@/lib/ui-error";
import type { PinDialogMode } from "@/components/memories/pin-dialog";
import { PinDialog } from "@/components/memories/pin-dialog";
import { LockedMemoryCard } from "@/components/memories/locked-memory-card";
import { secureMemory } from "@/lib/memory/secure-memory-client";
import type { Memory, MemoriesResponse, NamespaceInfo, SortOption, ImportResult } from "@/types/dashboard";

interface NamespacesResponse {
  success: boolean;
  data: {
    namespaces: NamespaceInfo[];
    total: number;
  };
}

type FeedbackEventType = "thumbs_up" | "thumbs_down";

interface PersonalizationProfileResponse {
  success: boolean;
  available?: boolean;
  reason?: string | null;
  profile?: {
    personalization_enabled: boolean;
    total_feedback_count: number;
    positive_feedback_count?: number;
    negative_feedback_count?: number;
    updated_at?: string;
  };
}

interface MemoriesApiEnvelope {
  success: boolean;
  data?: MemoriesResponse;
  error?: string | { code?: string; message?: string };
  meta?: {
    version?: string;
    cached?: boolean;
    latencyMs?: number;
    semanticCache?: {
      enabled?: boolean;
      variant?: "control" | "treatment" | null;
      scope?: "dashboard" | "all";
      readEnabled?: boolean;
      writeEnabled?: boolean;
      reason?: string;
      bucket?: number | null;
      hit?: boolean;
    };
  };
}

interface SearchDiagnostics {
  mode: string;
  requestedMode: string;
  cached: boolean;
  latencyMs: number | null;
  fallbackReason: string | null;
  routerLearningApplied: boolean | null;
  semanticCacheVariant: "control" | "treatment" | null;
}

// ============================================
// Icons
// ============================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const BrainIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.129A12.007 12.007 0 0112 21a12.007 12.007 0 01-7.363-2.558l-.772-.129c-1.717-.293-2.299-2.379-1.067-3.611L5 14.5" />
  </svg>
);

const TagIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);

const FilterIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
  </svg>
);

const SortIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const LoadingSpinner = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const InboxIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const UploadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const ThumbUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9V5.25A2.25 2.25 0 0012 3l-.665.665a3.75 3.75 0 00-1.033 2.652V9H5.25A2.25 2.25 0 003 11.25v6A2.25 2.25 0 005.25 19.5h10.098a2.25 2.25 0 002.184-1.707l1.08-4.32a2.25 2.25 0 00-2.184-2.793H14.25z" />
  </svg>
);

const ThumbDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 15v3.75A2.25 2.25 0 0012 21l.665-.665a3.75 3.75 0 001.033-2.652V15h5.052A2.25 2.25 0 0021 12.75v-6A2.25 2.25 0 0018.75 4.5H8.652a2.25 2.25 0 00-2.184 1.707l-1.08 4.32a2.25 2.25 0 002.184 2.793H9.75z" />
  </svg>
);

// ============================================
// Helpers
// ============================================

function sortToApiParams(sort: SortOption): { sort: string; order: string } {
  switch (sort) {
    case "date_desc": return { sort: "created_at", order: "desc" };
    case "date_asc": return { sort: "created_at", order: "asc" };
    case "importance": return { sort: "importance", order: "desc" };
    case "relevance": return { sort: "created_at", order: "desc" }; // relevance only in search mode
    default: return { sort: "created_at", order: "desc" };
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getJsonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }
  return headers;
}

function getAdaptiveThreshold(query: string): string {
  const length = query.trim().length;
  if (length <= 8) return "0.45";
  if (length <= 24) return "0.55";
  return "0.65";
}

// ============================================
// Component
// ============================================

export default function MemoriesClient() {
  const { t } = useDashboardTranslation();

  // State
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>("date_desc");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [offset, setOffset] = useState(0);

  // E2E encryption UI state (client-side only, never persisted)
  const [e2eLoading, setE2eLoading] = useState(true);
  const [hasE2ESetup, setHasE2ESetup] = useState(false);
  const [isE2EUnlocked, setIsE2EUnlocked] = useState(secureMemory.isUnlocked);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<PinDialogMode>("unlock");
  const [decryptedById, setDecryptedById] = useState<Record<string, string>>({});
  const [decryptErrorById, setDecryptErrorById] = useState<Record<string, string>>({});

  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [namespace, setNamespace] = useState("default");
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);
  const [personalizationAvailable, setPersonalizationAvailable] = useState(true);
  const [personalizationLoading, setPersonalizationLoading] = useState(true);
  const [personalizationActionLoading, setPersonalizationActionLoading] = useState(false);
  const [personalizationMessage, setPersonalizationMessage] = useState<string | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [feedbackSubmittingById, setFeedbackSubmittingById] = useState<Record<string, boolean>>({});
  const [feedbackStateById, setFeedbackStateById] = useState<Record<string, FeedbackEventType>>({});
  const [searchDiagnostics, setSearchDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [screenReaderStatus, setScreenReaderStatus] = useState("");
  const activeRequestIdRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const namespaceRequestGuardRef = useRef(createLatestRequestGuard());
  const personalizationRequestGuardRef = useRef(createLatestRequestGuard());

  // Date range filters
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState("");

  // Export / Import state
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const ITEMS_PER_PAGE = 20;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch namespaces on mount
  useEffect(() => {
    const requestGuard = namespaceRequestGuardRef.current;
    const request = requestGuard.begin();

    fetch("/api/v1/memories/namespaces", { signal: request.signal })
      .then(res => res.json())
      .then((data: NamespacesResponse) => {
        if (!requestGuard.isCurrent(request.id)) {
          return;
        }
        if (data.success && data.data?.namespaces) {
          setNamespaces(data.data.namespaces);
        }
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setScreenReaderStatus(getErrorMessage(error, "Failed to load namespaces."));
        }
      })
      .finally(() => {
        if (requestGuard.isCurrent(request.id)) {
          requestGuard.finish(request.id);
        }
      });

    return () => requestGuard.cancel();
  }, []);

  const refreshPersonalization = useCallback(async () => {
    const request = personalizationRequestGuardRef.current.begin();
    setPersonalizationLoading(true);
    try {
      const params = new URLSearchParams({ namespace });
      const res = await fetch(`/api/v1/memories/personalization?${params.toString()}`, {
        signal: request.signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to load personalization (${res.status})`);
      }
      const data: PersonalizationProfileResponse = await res.json();

      if (!personalizationRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      setPersonalizationAvailable(data.available !== false);
      setPersonalizationEnabled(data.profile?.personalization_enabled !== false);
      setFeedbackCount(data.profile?.total_feedback_count || 0);
      if (data.reason === "schema_missing") {
        setPersonalizationMessage("Personalization schema is not applied yet. Run the latest migration.");
      } else {
        setPersonalizationMessage(null);
      }
    } catch (error) {
      if (!isAbortError(error) && personalizationRequestGuardRef.current.isCurrent(request.id)) {
        setPersonalizationAvailable(false);
        setPersonalizationEnabled(false);
        setPersonalizationMessage(getErrorMessage(error, "Could not load personalization settings."));
      }
    } finally {
      if (personalizationRequestGuardRef.current.isCurrent(request.id)) {
        setPersonalizationLoading(false);
        personalizationRequestGuardRef.current.finish(request.id);
      }
    }
  }, [namespace]);

  useEffect(() => {
    const requestGuard = personalizationRequestGuardRef.current;
    void refreshPersonalization();
    return () => requestGuard.cancel();
  }, [refreshPersonalization]);

  // Fetch E2E setup status on mount
  const refreshE2E = useCallback(async () => {
    setE2eLoading(true);
    const material = await secureMemory.getSetupMaterial();
    setHasE2ESetup(Boolean(material?.hasSetup));
    setE2eLoading(false);
  }, []);

  useEffect(() => {
    void refreshE2E();
  }, [refreshE2E]);

  const openPinSetup = () => {
    setPinDialogMode("setup");
    setPinDialogOpen(true);
  };

  const openPinUnlock = () => {
    setPinDialogMode("unlock");
    setPinDialogOpen(true);
  };

  const lockEncryptedMemories = () => {
    secureMemory.lock();
    setIsE2EUnlocked(false);
    setDecryptedById({});
    setDecryptErrorById({});
  };

  // Fetch memories
  const fetchMemories = useCallback(async (resetOffset = true) => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setIsLoading(true);
    setFetchError(null);
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const params = new URLSearchParams();

      // Browse mode: no query param. Search mode: include query.
      if (debouncedQuery.trim()) {
        const normalizedQuery = debouncedQuery.trim();
        params.set("query", normalizedQuery);
        params.set("mode", "auto");
        params.set("threshold", getAdaptiveThreshold(normalizedQuery));
      }

      params.set("limit", String(ITEMS_PER_PAGE));
      params.set("offset", String(currentOffset));
      params.set("namespace", namespace);

      // Sort
      const { sort, order } = sortToApiParams(sortOption);
      params.set("sort", sort);
      params.set("order", order);

      // Filters
      if (selectedTags.length > 0) {
        params.set("tags", selectedTags.join(","));
      }
      if (selectedTypes.length === 1) {
        params.set("memory_type", selectedTypes[0]);
      }

      // Date filters
      if (afterDate) params.set("after", new Date(afterDate).toISOString());
      if (beforeDate) params.set("before", new Date(beforeDate + "T23:59:59").toISOString());

      const res = await fetch(`/api/v1/memories?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      const data: MemoriesApiEnvelope = await res.json();
      if (requestId !== activeRequestIdRef.current) return;

      if (!data.success || !data.data) {
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || "Failed to fetch entities";
        throw new Error(errorMessage);
      }

      const responseData = data.data;
      const newMemories = responseData.results || [];

      if (resetOffset) {
        setMemories(newMemories);
        setOffset(ITEMS_PER_PAGE);
      } else {
        setMemories(prev => [...prev, ...newMemories]);
        setOffset(currentOffset + ITEMS_PER_PAGE);
      }

      setTotalCount(responseData.total ?? responseData.count ?? newMemories.length);
      setHasMore(newMemories.length === ITEMS_PER_PAGE);
      setSearchDiagnostics({
        mode: responseData.mode || (debouncedQuery.trim() ? "search" : "browse"),
        requestedMode: responseData.requestedMode || (debouncedQuery.trim() ? "auto" : "browse"),
        cached: data.meta?.cached ?? responseData.cached ?? false,
        latencyMs: typeof data.meta?.latencyMs === "number" ? data.meta.latencyMs : null,
        fallbackReason: responseData.fallback?.reason || null,
        routerLearningApplied:
          typeof responseData.routerLearning?.applied === "boolean"
            ? responseData.routerLearning.applied
            : null,
        semanticCacheVariant: data.meta?.semanticCache?.variant ?? null,
      });
      setScreenReaderStatus(
        `${newMemories.length} results loaded. ${
          data.meta?.cached ? "Cache hit." : "Cache miss."
        } ${typeof data.meta?.latencyMs === "number" ? `Latency ${data.meta.latencyMs}ms.` : ""}`
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (requestId !== activeRequestIdRef.current) return;
      const message = getErrorMessage(error, "An unexpected error occurred");
      setFetchError(message);
      setScreenReaderStatus(`Entity search failed: ${message}`);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
      }
    }
  }, [debouncedQuery, selectedTags, selectedTypes, namespace, sortOption, afterDate, beforeDate, offset]);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const handleTogglePersonalization = useCallback(async () => {
    setPersonalizationActionLoading(true);
    try {
      const res = await fetch("/api/v1/memories/personalization", {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({
          namespace,
          personalization_enabled: !personalizationEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update personalization (${res.status})`);
      }

      const data: PersonalizationProfileResponse = await res.json();
      setPersonalizationEnabled(data.profile?.personalization_enabled !== false);
      setFeedbackCount(data.profile?.total_feedback_count || 0);
      setPersonalizationMessage(
        data.profile?.personalization_enabled
          ? "Adaptive ranking is enabled."
          : "Adaptive ranking is disabled."
      );

      if (debouncedQuery.trim()) {
        void fetchMemories(true);
      }
    } catch (error) {
      setPersonalizationMessage(getErrorMessage(error, "Failed to update personalization setting."));
    } finally {
      setPersonalizationActionLoading(false);
    }
  }, [debouncedQuery, fetchMemories, namespace, personalizationEnabled]);

  const handleResetPersonalization = useCallback(async () => {
    if (!confirm("Reset personalized learning signals for this namespace?")) {
      return;
    }

    setPersonalizationActionLoading(true);
    try {
      const res = await fetch("/api/v1/memories/personalization", {
        method: "DELETE",
        headers: getJsonHeaders(),
        body: JSON.stringify({
          namespace,
          delete_feedback_history: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to reset personalization (${res.status})`);
      }

      setFeedbackStateById({});
      setFeedbackCount(0);
      setPersonalizationMessage("Personalized learning signals were reset.");
      await refreshPersonalization();

      if (debouncedQuery.trim()) {
        void fetchMemories(true);
      }
    } catch (error) {
      setPersonalizationMessage(getErrorMessage(error, "Failed to reset personalization."));
    } finally {
      setPersonalizationActionLoading(false);
    }
  }, [debouncedQuery, fetchMemories, namespace, refreshPersonalization]);

  const submitFeedback = useCallback(async (memory: Memory, eventType: FeedbackEventType) => {
    if (!personalizationAvailable) return;

    setFeedbackSubmittingById((prev) => ({ ...prev, [memory.id]: true }));
    try {
      const res = await fetch("/api/v1/memories/feedback", {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({
          memory_id: memory.id,
          event_type: eventType,
          namespace,
          query: debouncedQuery.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error(`Feedback failed (${res.status})`);
      }

      setFeedbackStateById((prev) => ({ ...prev, [memory.id]: eventType }));
      setPersonalizationMessage(
        eventType === "thumbs_up" ? "Marked as helpful." : "Marked as not helpful."
      );
      await refreshPersonalization();

      if (debouncedQuery.trim()) {
        void fetchMemories(true);
      }
    } catch (error) {
      setPersonalizationMessage(getErrorMessage(error, "Failed to submit feedback."));
    } finally {
      setFeedbackSubmittingById((prev) => ({ ...prev, [memory.id]: false }));
    }
  }, [debouncedQuery, fetchMemories, namespace, personalizationAvailable, refreshPersonalization]);

  // Reset & fetch on filter/sort changes
  useEffect(() => {
    fetchMemories(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedTags, selectedTypes, namespace, sortOption, afterDate, beforeDate]);

  // Decrypt encrypted memories in the current page (lazy, per-memory).
  // NOTE: decrypted content lives only in React state; lock() clears it.
  useEffect(() => {
    if (!isE2EUnlocked) return;

    let cancelled = false;

    const run = async () => {
      const updates: Record<string, string> = {};
      const errors: Record<string, string> = {};

      for (const m of memories) {
        if (m.is_encrypted !== true) continue;
        if (!m.encrypted_content) continue;
        if (decryptedById[m.id] || decryptErrorById[m.id]) continue;

        try {
          const plaintext = await secureMemory.decryptFromStorage(m.encrypted_content);
          if (cancelled) return;
          updates[m.id] = plaintext;
        } catch {
          errors[m.id] = "decrypt_failed";
        }
      }

      if (cancelled) return;
      if (Object.keys(updates).length > 0) {
        setDecryptedById((prev) => ({ ...prev, ...updates }));
      }
      if (Object.keys(errors).length > 0) {
        setDecryptErrorById((prev) => ({ ...prev, ...errors }));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [decryptedById, decryptErrorById, isE2EUnlocked, memories]);

  // Load more
  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchMemories(false);
    }
  };

  // Extract unique tags from memories
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    memories.forEach(m => {
      m.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [memories]);

  // Memory types
  const memoryTypes = ["fact", "preference", "experience", "relationship", "instruction"];

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Toggle memory type selection
  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // formatDate imported from @/lib/format-date (using "long" style for date+time)

  // Get memory type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case "fact": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "preference": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "experience": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "relationship": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
      case "instruction": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      default: return "bg-szn-surface text-szn-text-2";
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedTypes([]);
    setSearchQuery("");
    setAfterDate("");
    setBeforeDate("");
  };

  const hasActiveFilters = selectedTags.length > 0 || selectedTypes.length > 0 || searchQuery.length > 0 || afterDate || beforeDate;
  const activeFilterCount = selectedTags.length + selectedTypes.length + (afterDate ? 1 : 0) + (beforeDate ? 1 : 0);

  // Export handler
  const handleExport = async (format: "json" | "csv") => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const params = new URLSearchParams({ format, namespace });
      const res = await fetch(`/api/memories/export?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const ext = format === "csv" ? "csv" : "json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seizn-memories-${new Date().toISOString().split("T")[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFetchError(getErrorMessage(err, "Failed to export memories."));
    } finally {
      setIsExporting(false);
    }
  };

  // Import handler
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const memories = Array.isArray(parsed) ? parsed : parsed.memories;
      if (!Array.isArray(memories)) throw new Error("Invalid format: expected array or { memories: [...] }");

      const res = await fetch("/api/memories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories, skip_duplicates: true }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.results);
        if (data.results.imported > 0) fetchMemories(true);
      } else {
        setFetchError(data.error || "Import failed");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <p className="sr-only" aria-live="polite">{screenReaderStatus}</p>
      {/* Header */}
      <div className="szn-card rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-szn-accent flex items-center justify-center">
              <BrainIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-szn-text-1">
                {t("dashboard.memoriesPage.title") || "Memories"}
              </h1>
              <p className="text-szn-text-2">
                {t("dashboard.memoriesPage.subtitle") || "Browse and search your AI memories"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-szn-text-1">{totalCount}</p>
            <p className="text-sm text-szn-text-2">{t("dashboard.memoriesPage.totalMemories") || "Total Memories"}</p>

            <div className="mt-3 flex items-center justify-end gap-2">
              {e2eLoading ? (
                <div className="h-9 w-28 rounded-xl bg-szn-surface animate-pulse" />
              ) : !hasE2ESetup ? (
                <button
                  type="button"
                  onClick={openPinSetup}
                  className="px-4 py-2 text-sm rounded-xl bg-szn-accent text-white font-medium hover:bg-szn-accent/90 transition-colors"
                >
                  Set up PIN
                </button>
              ) : isE2EUnlocked ? (
                <button
                  type="button"
                  onClick={lockEncryptedMemories}
                  className="px-4 py-2 text-sm rounded-xl border border-szn-border text-szn-text-1 bg-szn-card hover:bg-szn-surface-1 transition-colors"
                >
                  Lock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openPinUnlock}
                  className="px-4 py-2 text-sm rounded-xl bg-szn-accent text-white font-medium hover:bg-szn-accent/90 transition-colors"
                >
                  Unlock
                </button>
              )}
            </div>

            {hasE2ESetup && !isE2EUnlocked && (
              <p className="mt-2 text-xs text-szn-text-3">
                Encrypted memories are hidden until unlocked.
              </p>
            )}
          </div>
        </div>

        {/* Export / Import Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-szn-border">
          <div className="flex items-center rounded-lg border border-szn-border overflow-hidden bg-szn-card">
            <span className="px-3 py-2 text-xs font-medium bg-szn-signal-soft text-szn-signal">
              {t("dashboard.memoriesPage.memoriesTab") || "Memories"}
            </span>
            <Link
              href="/dashboard/memories/decay"
              className="px-3 py-2 text-xs font-medium text-szn-text-2 hover:text-szn-signal hover:bg-szn-surface-1 transition-colors"
            >
              {t("dashboard.memoriesPage.decayTab") || "Decay"}
            </Link>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(v => !v)}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-szn-border text-szn-text-1 bg-szn-card hover:bg-szn-surface-1 transition-colors disabled:opacity-50"
            >
              {isExporting ? <LoadingSpinner className="w-4 h-4" /> : <DownloadIcon className="w-4 h-4" />}
              {t("dashboard.memoriesPage.export") || "Export"}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-szn-card border border-szn-border rounded-xl shadow-lg z-10">
                <button
                  onClick={() => handleExport("json")}
                  className="w-full px-4 py-2 text-left text-sm text-szn-text-1 hover:bg-szn-surface-1 rounded-t-xl"
                >
                  JSON
                </button>
                <button
                  onClick={() => handleExport("csv")}
                  className="w-full px-4 py-2 text-left text-sm text-szn-text-1 hover:bg-szn-surface-1 rounded-b-xl"
                >
                  CSV
                </button>
              </div>
            )}
          </div>

          {/* Import */}
          <label className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-szn-border text-szn-text-1 bg-szn-card hover:bg-szn-surface-1 transition-colors cursor-pointer">
            {isImporting ? <LoadingSpinner className="w-4 h-4" /> : <UploadIcon className="w-4 h-4" />}
            {t("dashboard.memoriesPage.import") || "Import"}
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={isImporting}
              className="hidden"
            />
          </label>

          {/* Import Result Toast */}
          {importResult && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
              <span>{importResult.imported} imported</span>
              {importResult.skipped > 0 && <span>/ {importResult.skipped} skipped</span>}
              {importResult.failed > 0 && <span className="text-red-600 dark:text-red-400">/ {importResult.failed} failed</span>}
              <button onClick={() => setImportResult(null)} className="ml-1 hover:opacity-70">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Filters */}
        <div className="lg:col-span-1 space-y-4">
          {/* Search */}
          <div className="szn-card rounded-lg p-4">
            <label className="block text-sm font-medium text-szn-text-2 mb-2">
              <SearchIcon className="w-4 h-4 inline mr-1" />
              {t("dashboard.memoriesPage.search") || "Search"}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("dashboard.memoriesPage.searchPlaceholder") || "Search entities..."}
              aria-label={t("dashboard.memoriesPage.search") || "Search entities"}
              className="w-full px-4 py-2 rounded-xl border border-szn-border bg-szn-surface-1 text-szn-text-1 placeholder:text-szn-text-3 focus:outline-none focus:ring-2 focus:ring-szn-accent"
            />
          </div>

          {/* Mobile: Advanced filters toggle */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(open => !open)}
              aria-expanded={mobileFiltersOpen}
              className="w-full px-4 py-3 text-sm font-medium text-szn-text-1 bg-szn-surface-1 border border-szn-border rounded-lg hover:bg-szn-surface-1 transition-colors flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <FilterIcon className="w-4 h-4 text-szn-text-2" />
                {t("dashboard.memoriesPage.filters") || "Filters"}
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-szn-accent/10 text-szn-accent">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <ChevronDownIcon className={`w-4 h-4 text-szn-text-2 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block space-y-4`}>
            {/* Namespace */}
            <div className="szn-card rounded-lg p-4">
              <label className="block text-sm font-medium text-szn-text-2 mb-2">
                {t("dashboard.memoriesPage.namespace") || "Namespace"}
              </label>
              {namespaces.length > 0 ? (
                <select
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  aria-label={t("dashboard.memoriesPage.namespace") || "Namespace"}
                  className="w-full px-4 py-2 rounded-xl border border-szn-border bg-szn-surface-1 text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent"
                >
                  {namespaces.map((ns) => (
                    <option key={ns.name} value={ns.name}>
                      {ns.name} ({ns.count})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="default"
                  className="w-full px-4 py-2 rounded-xl border border-szn-border bg-szn-surface-1 text-szn-text-1 placeholder:text-szn-text-3 focus:outline-none focus:ring-2 focus:ring-szn-accent"
                />
              )}
            </div>

            {/* Adaptive Learning */}
            <div className="szn-card rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-szn-text-2">
                  Adaptive Learning
                </span>
                {personalizationLoading ? (
                  <LoadingSpinner className="w-4 h-4 text-szn-accent" />
                ) : (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      personalizationEnabled
                        ? "bg-szn-success/10 text-szn-success"
                        : "bg-szn-surface text-szn-text-2"
                    }`}
                  >
                    {personalizationEnabled ? "ON" : "OFF"}
                  </span>
                )}
              </div>

              <p className="text-xs text-szn-text-2 mb-3">
                Learns from your feedback and re-ranks search results for this namespace.
              </p>

              <div className="flex items-center justify-between text-xs text-szn-text-2 mb-3">
                <span>Feedback signals</span>
                <span>{feedbackCount}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePersonalization}
                  disabled={personalizationActionLoading || personalizationLoading || !personalizationAvailable}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    personalizationEnabled
                      ? "bg-szn-surface text-szn-text-2 hover:bg-szn-surface-1"
                      : "bg-szn-accent text-white hover:bg-szn-accent/90"
                  } disabled:opacity-50`}
                >
                  {personalizationEnabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={handleResetPersonalization}
                  disabled={personalizationActionLoading || personalizationLoading || !personalizationAvailable}
                  className="px-3 py-1.5 text-xs rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 disabled:opacity-50"
                >
                  Reset
                </button>
              </div>

              {personalizationMessage && (
                <p className="mt-3 text-xs text-szn-text-2">{personalizationMessage}</p>
              )}
            </div>

            {/* Date Range */}
            <div className="szn-card rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarIcon className="w-4 h-4 text-szn-text-2" />
                <span className="text-sm font-medium text-szn-text-2">
                  {t("dashboard.memoriesPage.dateRange") || "Date Range"}
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-szn-text-2 mb-1">
                    {t("dashboard.memoriesPage.after") || "After"}
                  </label>
                  <input
                    type="date"
                    value={afterDate}
                    onChange={(e) => setAfterDate(e.target.value)}
                    aria-label={t("dashboard.memoriesPage.after") || "After date"}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-szn-border bg-szn-surface-1 text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-szn-text-2 mb-1">
                    {t("dashboard.memoriesPage.before") || "Before"}
                  </label>
                  <input
                    type="date"
                    value={beforeDate}
                    onChange={(e) => setBeforeDate(e.target.value)}
                    aria-label={t("dashboard.memoriesPage.before") || "Before date"}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-szn-border bg-szn-surface-1 text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent"
                  />
                </div>
              </div>
            </div>

            {/* Memory Types */}
            <div className="szn-card rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FilterIcon className="w-4 h-4 text-szn-text-2" />
                <span className="text-sm font-medium text-szn-text-2">
                  {t("dashboard.memoriesPage.memoryTypes") || "Entity Types"}
                </span>
              </div>
              <div className="space-y-2">
                {memoryTypes.map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      onChange={() => toggleType(type)}
                      className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                    />
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeColor(type)}`}>
                      {type}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="szn-card rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TagIcon className="w-4 h-4 text-szn-text-2" />
                <span className="text-sm font-medium text-szn-text-2">
                  {t("dashboard.memoriesPage.tags") || "Tags"}
                </span>
              </div>
              {allTags.length > 0 ? (
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        selectedTags.includes(tag)
                          ? "bg-szn-accent text-white"
                          : "bg-szn-surface text-szn-text-2 hover:bg-szn-surface-1"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-szn-text-3">
                  {t("dashboard.memoriesPage.noTags") || "No tags available"}
                </p>
              )}
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full px-4 py-2 text-sm text-szn-text-2 hover:text-szn-text-1 bg-szn-surface hover:bg-szn-surface-1 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <XIcon className="w-4 h-4" />
                {t("dashboard.memoriesPage.clearFilters") || "Clear Filters"}
              </button>
            )}
          </div>
        </div>

        {/* Main Content - Memory List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Sort & Info Bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-szn-text-2">
              {t("dashboard.memoriesPage.showing") || "Showing"} {memories.length} {t("dashboard.memoriesPage.of") || "of"} {totalCount} {t("dashboard.memoriesPage.results") || "results"}
            </p>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                aria-expanded={showSortDropdown}
                aria-haspopup="listbox"
                aria-label={t("dashboard.memoriesPage.sortBy") || "Sort entities"}
                className="flex items-center gap-2 px-3 py-2 text-sm text-szn-text-1 bg-szn-card border border-szn-border rounded-xl hover:bg-szn-surface-1 transition-colors"
              >
                <SortIcon className="w-4 h-4 text-szn-text-2" />
                <span>
                  {sortOption === "date_desc" && (t("dashboard.memoriesPage.sortNewest") || "Newest First")}
                  {sortOption === "date_asc" && (t("dashboard.memoriesPage.sortOldest") || "Oldest First")}
                  {sortOption === "importance" && (t("dashboard.memoriesPage.sortImportance") || "Most Important")}
                  {sortOption === "relevance" && (t("dashboard.memoriesPage.sortRelevance") || "Most Relevant")}
                </span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showSortDropdown ? "rotate-180" : ""}`} />
              </button>

              {showSortDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-szn-card border border-szn-border rounded-xl shadow-lg z-10">
                  {([
                    ["date_desc", t("dashboard.memoriesPage.sortNewest") || "Newest First"],
                    ["date_asc", t("dashboard.memoriesPage.sortOldest") || "Oldest First"],
                    ["importance", t("dashboard.memoriesPage.sortImportance") || "Most Important"],
                    ...(debouncedQuery ? [["relevance", t("dashboard.memoriesPage.sortRelevance") || "Most Relevant"]] : []),
                  ] as [SortOption, string][]).map(([value, label], i, arr) => (
                    <button
                      key={value}
                      onClick={() => { setSortOption(value); setShowSortDropdown(false); }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-szn-surface-1 ${
                        i === 0 ? "rounded-t-xl" : ""
                      } ${i === arr.length - 1 ? "rounded-b-xl" : ""} ${
                        sortOption === value ? "text-szn-accent font-medium" : "text-szn-text-1"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {searchDiagnostics && (
            <div
              className="szn-card rounded-lg p-3 border border-szn-border"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-szn-text-2">
                <span className="px-2 py-0.5 rounded-full bg-szn-surface">
                  mode: {searchDiagnostics.mode}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-szn-surface">
                  requested: {searchDiagnostics.requestedMode}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full ${
                    searchDiagnostics.cached
                      ? "bg-szn-success/10 text-szn-success"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}
                >
                  {searchDiagnostics.cached ? "cache hit" : "cache miss"}
                </span>
                {searchDiagnostics.fallbackReason && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    fallback: {searchDiagnostics.fallbackReason}
                  </span>
                )}
                {searchDiagnostics.semanticCacheVariant && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    semantic cache: {searchDiagnostics.semanticCacheVariant}
                  </span>
                )}
                {searchDiagnostics.routerLearningApplied !== null && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    router learning: {searchDiagnostics.routerLearningApplied ? "applied" : "not applied"}
                  </span>
                )}
                {typeof searchDiagnostics.latencyMs === "number" && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                    latency: {searchDiagnostics.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-szn-text-2">{t("dashboard.memoriesPage.activeFilters") || "Active filters"}:</span>
              {selectedTypes.map(type => (
                <span key={type} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${getTypeColor(type)}`}>
                  {type}
                  <button onClick={() => toggleType(type)} className="hover:opacity-70" aria-label={`Remove ${type} filter`}>
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedTags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-szn-accent/10 text-szn-accent rounded-full">
                  {tag}
                  <button onClick={() => toggleTag(tag)} className="hover:opacity-70" aria-label={`Remove ${tag} filter`}>
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-szn-surface text-szn-text-1 rounded-full">
                  &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {afterDate && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200 rounded-full">
                  {t("dashboard.memoriesPage.after") || "After"} {afterDate}
                  <button onClick={() => setAfterDate("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {beforeDate && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200 rounded-full">
                  {t("dashboard.memoriesPage.before") || "Before"} {beforeDate}
                  <button onClick={() => setBeforeDate("")} className="hover:opacity-70">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Error Banner */}
          {fetchError && (
            <div className="szn-card rounded-lg p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 flex items-center justify-between" role="alert">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{t("dashboard.memoriesPage.fetchError") || "Failed to load entities"}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{fetchError}</p>
                </div>
              </div>
              <button
                onClick={() => fetchMemories(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors"
              >
                {t("dashboard.memoriesPage.retry") || "Retry"}
              </button>
            </div>
          )}

          {/* Memory Cards */}
          {isLoading && memories.length === 0 ? (
            <div className="szn-card rounded-lg p-12 text-center">
              <LoadingSpinner className="w-8 h-8 text-szn-accent mx-auto" />
              <p className="mt-4 text-szn-text-2">{t("dashboard.memoriesPage.loading") || "Loading entities..."}</p>
            </div>
          ) : memories.length === 0 ? (
            <div className="szn-card rounded-lg p-12 text-center">
              <InboxIcon className="w-16 h-16 text-szn-text-3 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-szn-text-3 mb-2">
                {t("dashboard.memoriesPage.noMemories") || "No entities found"}
              </h3>
              <p className="text-szn-text-3">
                {hasActiveFilters
                  ? (t("dashboard.memoriesPage.noMatchingMemories") || "Try adjusting your filters or search query")
                  : (t("dashboard.memoriesPage.noMemoriesHint") || "Create NPCs, factions, or events via the API to see them here")
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => {
                const isEncrypted = memory.is_encrypted === true && Boolean(memory.encrypted_content);

                if (isEncrypted && !isE2EUnlocked) {
                  return (
                    <LockedMemoryCard
                      key={memory.id}
                      memory={{
                        id: memory.id,
                        memory_type: memory.memory_type,
                        tags: memory.tags || [],
                        created_at: memory.created_at,
                        importance: memory.importance,
                        source: memory.source,
                        similarity: memory.similarity,
                      }}
                      onUnlockRequest={hasE2ESetup ? openPinUnlock : openPinSetup}
                    />
                  );
                }

                const decrypted = isEncrypted ? decryptedById[memory.id] : undefined;
                const decryptFailed = isEncrypted ? Boolean(decryptErrorById[memory.id]) : false;

                return (
                  <div
                    key={memory.id}
                    className="szn-card rounded-lg p-4 hover:border-szn-accent/30 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Content */}
                        <p className="text-szn-text-1 mb-3 whitespace-pre-wrap">
                          {isEncrypted ? (
                            decrypted ? (
                              decrypted
                            ) : decryptFailed ? (
                              "[Unable to decrypt]"
                            ) : (
                              <span className="inline-flex items-center gap-2 text-szn-text-2">
                                <LoadingSpinner className="w-4 h-4 text-szn-accent" />
                                Decrypting...
                              </span>
                            )
                          ) : (
                            memory.content
                          )}
                        </p>

                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {/* Memory Type */}
                        <span className={`px-2 py-0.5 rounded-full ${getTypeColor(memory.memory_type)}`}>
                          {memory.memory_type}
                        </span>

                        {isEncrypted && (
                          <span className="px-2 py-0.5 rounded-full bg-szn-surface text-szn-text-2">
                            encrypted
                          </span>
                        )}

                        {/* Importance */}
                        {memory.importance != null && memory.importance !== 5 && (
                          <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <StarIcon className="w-3 h-3" />
                            {memory.importance}
                          </span>
                        )}

                        {/* Source */}
                        {memory.source && memory.source !== "api" && (
                          <span className="text-szn-text-3">
                            via {memory.source}
                          </span>
                        )}

                        {/* Tags */}
                        {memory.tags && memory.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <TagIcon className="w-3 h-3 text-szn-text-3" />
                            {memory.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-szn-text-2">
                                {tag}
                              </span>
                            ))}
                            {memory.tags.length > 3 && (
                              <span className="text-szn-text-3">+{memory.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Date */}
                        <span className="flex items-center gap-1 text-szn-text-3">
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(memory.created_at, "long")}
                        </span>

                        {/* Similarity Score */}
                        {memory.similarity !== undefined && memory.similarity > 0 && (
                          <span className="text-szn-accent">
                            {(memory.similarity * 100).toFixed(1)}% {t("dashboard.memoriesPage.match") || "match"}
                          </span>
                        )}

                        {/* Personalized Score */}
                        {debouncedQuery.trim() && memory.personalization_score !== undefined && (
                          <span className="text-indigo-600 dark:text-indigo-400">
                            {(memory.personalization_score * 100).toFixed(1)}% personalized
                          </span>
                        )}
                      </div>

                      {/* Feedback Actions */}
                      {debouncedQuery.trim() && personalizationAvailable && (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void submitFeedback(memory, "thumbs_up")}
                            disabled={feedbackSubmittingById[memory.id]}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50 ${
                              feedbackStateById[memory.id] === "thumbs_up"
                                ? "bg-szn-success/10 text-szn-success"
                                : "bg-szn-surface text-szn-text-2 hover:bg-szn-surface-1"
                            }`}
                          >
                            <ThumbUpIcon className="w-3.5 h-3.5" />
                            Helpful
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitFeedback(memory, "thumbs_down")}
                            disabled={feedbackSubmittingById[memory.id]}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50 ${
                              feedbackStateById[memory.id] === "thumbs_down"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                                : "bg-szn-surface text-szn-text-2 hover:bg-szn-surface-1"
                            }`}
                          >
                            <ThumbDownIcon className="w-3.5 h-3.5" />
                            Not Helpful
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {/* Load More */}
          {hasMore && memories.length > 0 && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="px-6 py-2 bg-szn-accent text-white rounded-xl hover:bg-szn-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    {t("dashboard.memoriesPage.loading") || "Loading..."}
                  </>
                ) : (
                  t("dashboard.memoriesPage.loadMore") || "Load More"
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <PinDialog
        isOpen={pinDialogOpen}
        mode={pinDialogMode}
        onClose={() => setPinDialogOpen(false)}
        onSetupSuccess={() => {
          setHasE2ESetup(true);
          setIsE2EUnlocked(true);
          setDecryptedById({});
          setDecryptErrorById({});
          void refreshE2E();
        }}
        onUnlockSuccess={() => {
          setIsE2EUnlocked(true);
        }}
      />
    </div>
  );
}
