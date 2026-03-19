"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  REGIONS,
  getRegionsForPlan,
  getDataResidencyInfo,
  getRegionMigrationInfo,
  type RegionCode,
} from "@/config/regions";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { formatDate } from "@/lib/format-date";
import { getErrorMessage } from "@/lib/ui-error";

interface RegionSelectorProps {
  organizationId: string;
  organizationPlan: string;
  currentRegion: RegionCode;
  regionLocked: boolean;
  onRegionChange?: (newRegion: RegionCode) => void;
  className?: string;
}

interface RegionHistory {
  id: string;
  from_region: RegionCode | null;
  to_region: RegionCode;
  reason: string | null;
  change_type: string;
  created_at: string;
}

export function RegionSelector({
  organizationId,
  organizationPlan,
  currentRegion,
  regionLocked,
  onRegionChange,
  className = "",
}: RegionSelectorProps) {
  const historyRequestGuardRef = useRef(createLatestRequestGuard());
  const [selectedRegion, setSelectedRegion] = useState<RegionCode>(currentRegion);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<RegionHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const planType = organizationPlan as 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';
  const availableRegions = getRegionsForPlan(planType);
  const currentRegionConfig = REGIONS[currentRegion];

  const fetchHistory = useCallback(async () => {
    const request = historyRequestGuardRef.current.begin();
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/region`, {
        signal: request.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(data?.message || data?.error, "Failed to fetch region history"));
      }
      if (historyRequestGuardRef.current.isCurrent(request.id) && data.success) {
        setHistory(data.history || []);
      }
    } catch (err) {
      if (isAbortError(err) || !historyRequestGuardRef.current.isCurrent(request.id)) {
        return;
      }
      setError(getErrorMessage(err, "Failed to fetch region history"));
    } finally {
      if (historyRequestGuardRef.current.isCurrent(request.id)) {
        setIsLoadingHistory(false);
      }
      historyRequestGuardRef.current.finish(request.id);
    }
  }, [organizationId]);

  useEffect(() => {
    if (showHistoryModal) {
      void fetchHistory();
    }
  }, [showHistoryModal, fetchHistory]);

  useEffect(() => () => historyRequestGuardRef.current.cancel(), []);

  const handleRegionChange = async () => {
    if (selectedRegion === currentRegion) return;
    setIsChanging(true);
    setError(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/region`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: selectedRegion,
          reason: reason || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onRegionChange?.(selectedRegion);
        setShowModal(false);
        setReason("");
      } else {
        setError(data.message || "Failed to change region");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to change region. Please try again."));
    } finally {
      setIsChanging(false);
    }
  };

  const residencyInfo = getDataResidencyInfo(selectedRegion);
  const migrationInfo = selectedRegion !== currentRegion
    ? getRegionMigrationInfo(currentRegion, selectedRegion)
    : null;

  return (
    <div className={className}>
      {/* Current Region Display */}
      <div className="szn-card rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-szn-text-1">
            Data Residency
          </h3>
          {regionLocked && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
              <LockIcon className="w-3 h-3" />
              Locked
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-2xl">
            {currentRegionConfig.flag}
          </div>
          <div>
            <p className="font-medium text-szn-text-1">
              {currentRegionConfig.name}
            </p>
            <p className="text-sm text-szn-text-2">
              {currentRegionConfig.dataCenter.city}, {currentRegionConfig.dataCenter.country}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {currentRegionConfig.compliance.map((cert) => (
            <span
              key={cert}
              className="px-2 py-1 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full"
            >
              {cert}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowModal(true)}
            disabled={regionLocked}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed theme-gradient-btn text-white"
          >
            Change Region
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="px-4 py-2.5 rounded-xl font-medium bg-szn-surface text-szn-text-1 hover:bg-szn-surface-1 transition-all"
          >
            <HistoryIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Change Region Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative szn-card rounded-3xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 text-szn-text-3 hover:text-szn-text-2 hover:bg-szn-surface-1 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
                <GlobeIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-szn-text-1">
                Change Data Region
              </h2>
              <p className="text-szn-text-2 text-sm mt-1">
                Select where your organization&apos;s data will be stored
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Region Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {Object.values(REGIONS).map((region) => {
                const isAvailable = availableRegions.some((r) => r.code === region.code);
                const isSelected = selectedRegion === region.code;
                const isCurrent = currentRegion === region.code;

                return (
                  <button
                    key={region.code}
                    onClick={() => isAvailable && region.available && setSelectedRegion(region.code)}
                    disabled={!isAvailable || !region.available}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? "border-szn-accent bg-szn-accent/5 dark:bg-szn-accent/10"
                        : isAvailable && region.available
                        ? "border-szn-border hover:border-szn-text-3"
                        : "border-szn-border opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{region.flag}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-szn-text-1 truncate">
                            {region.name}
                          </p>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                              Current
                            </span>
                          )}
                          {!region.available && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-szn-surface text-szn-text-2 rounded">
                              Coming Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-szn-text-2 mt-0.5">
                          {region.dataCenter.city}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {region.compliance.slice(0, 3).map((cert) => (
                            <span
                              key={cert}
                              className="px-1.5 py-0.5 text-[10px] bg-szn-surface text-szn-text-2 rounded"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Data Residency Info */}
            {residencyInfo && selectedRegion !== currentRegion && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                  Data Residency Implications
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                  <li>
                    <strong>Storage:</strong> {residencyInfo.storageLocation}
                  </li>
                  <li>
                    <strong>Processing:</strong> {residencyInfo.processingLocation}
                  </li>
                  <li>
                    <strong>Applicable Laws:</strong>{" "}
                    {residencyInfo.applicableLaws.join(", ")}
                  </li>
                </ul>
              </div>
            )}

            {/* Migration Info */}
            {migrationInfo && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                <h4 className="font-medium text-amber-900 dark:text-amber-300 mb-2">
                  Migration Information
                </h4>
                <ul className="text-sm text-amber-800 dark:text-amber-400 space-y-1">
                  <li>
                    <strong>Estimated Duration:</strong>{" "}
                    {migrationInfo.estimatedDuration}
                  </li>
                  <li>
                    <strong>Expected Downtime:</strong>{" "}
                    {migrationInfo.expectedDowntime}
                  </li>
                </ul>
              </div>
            )}

            {/* Reason Input */}
            {selectedRegion !== currentRegion && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-szn-text-1 mb-1.5">
                  Reason for change (optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Compliance requirement, latency optimization"
                  className="w-full px-4 py-3 bg-szn-card border border-szn-border rounded-xl text-szn-text-1 placeholder-szn-text-3 focus:outline-none focus:ring-2 focus:ring-szn-accent/40 dark:focus:ring-szn-accent/50 focus:border-transparent transition-all"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 bg-szn-surface text-szn-text-1 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegionChange}
                disabled={isChanging || selectedRegion === currentRegion}
                className="flex-1 theme-gradient-btn text-white px-4 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChanging ? "Changing..." : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowHistoryModal(false)}
          />
          <div className="relative szn-card rounded-3xl p-8 w-full max-w-lg shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-4 right-4 p-2 text-szn-text-3 hover:text-szn-text-2 hover:bg-szn-surface-1 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-szn-text-1">
                Region Change History
              </h2>
            </div>

            {isLoadingHistory ? (
              <div className="py-8 text-center text-szn-text-2">Loading...</div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-szn-text-2">
                No region changes recorded
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 bg-szn-bg rounded-xl"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {item.from_region && (
                        <>
                          <span className="text-lg">
                            {REGIONS[item.from_region]?.flag || "?"}
                          </span>
                          <span className="text-szn-text-3">→</span>
                        </>
                      )}
                      <span className="text-lg">
                        {REGIONS[item.to_region]?.flag || "?"}
                      </span>
                      <span className="font-medium text-szn-text-1">
                        {REGIONS[item.to_region]?.name || item.to_region}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-szn-text-2">
                      <span>{formatDate(item.created_at)}</span>
                      <span className="px-1.5 py-0.5 bg-szn-surface rounded">
                        {item.change_type.replace("_", " ")}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="mt-2 text-sm text-szn-text-2">
                        {item.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full mt-6 px-4 py-3 bg-szn-surface text-szn-text-1 rounded-xl font-medium hover:bg-szn-surface-1 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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

export default RegionSelector;
