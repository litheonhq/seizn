"use client";

import { useState, useMemo } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface PricingTier {
  id: string;
  name: string;
  basePrice: number;
  includedCalls: number;
  includedMemories: number;
  includedExtractions: number;
  overageCallRate: number;
  overageMemoryRate: number;
  overageExtractionRate: number;
}

const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    basePrice: 0,
    includedCalls: 1000,
    includedMemories: 100,
    includedExtractions: 50,
    overageCallRate: 0.001,
    overageMemoryRate: 0.01,
    overageExtractionRate: 0.02,
  },
  {
    id: "pro",
    name: "Pro",
    basePrice: 29,
    includedCalls: 50000,
    includedMemories: 5000,
    includedExtractions: 2500,
    overageCallRate: 0.0008,
    overageMemoryRate: 0.008,
    overageExtractionRate: 0.015,
  },
  {
    id: "team",
    name: "Team",
    basePrice: 99,
    includedCalls: 200000,
    includedMemories: 25000,
    includedExtractions: 10000,
    overageCallRate: 0.0005,
    overageMemoryRate: 0.005,
    overageExtractionRate: 0.01,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    basePrice: 499,
    includedCalls: 1000000,
    includedMemories: 100000,
    includedExtractions: 50000,
    overageCallRate: 0.0003,
    overageMemoryRate: 0.003,
    overageExtractionRate: 0.008,
  },
];

const usagePresets = [
  { id: "startup", apiCalls: 10000, memories: 500, extractions: 200 },
  { id: "growing", apiCalls: 75000, memories: 10000, extractions: 5000 },
  { id: "scale", apiCalls: 300000, memories: 50000, extractions: 20000 },
  { id: "enterprise", apiCalls: 1500000, memories: 200000, extractions: 100000 },
];

export default function CalculatorClient() {
  const { t } = useDashboardTranslation();

  const [apiCalls, setApiCalls] = useState(25000);
  const [memories, setMemories] = useState(2500);
  const [extractions, setExtractions] = useState(1000);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const calculations = useMemo(() => {
    return pricingTiers.map((tier) => {
      const overageCalls = Math.max(0, apiCalls - tier.includedCalls);
      const overageMemories = Math.max(0, memories - tier.includedMemories);
      const overageExtractions = Math.max(0, extractions - tier.includedExtractions);

      const overageCost =
        overageCalls * tier.overageCallRate +
        overageMemories * tier.overageMemoryRate +
        overageExtractions * tier.overageExtractionRate;

      const totalCost = tier.basePrice + overageCost;

      return {
        tier,
        overageCalls,
        overageMemories,
        overageExtractions,
        overageCost,
        totalCost,
      };
    });
  }, [apiCalls, memories, extractions]);

  const recommendedTier = useMemo(() => {
    const sorted = [...calculations].sort((a, b) => a.totalCost - b.totalCost);
    return sorted[0];
  }, [calculations]);

  const handlePresetSelect = (presetId: string) => {
    const preset = usagePresets.find((p) => p.id === presetId);
    if (preset) {
      setApiCalls(preset.apiCalls);
      setMemories(preset.memories);
      setExtractions(preset.extractions);
      setSelectedPreset(presetId);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("dashboard.calculator.title")}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          {t("dashboard.calculator.subtitle")}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("dashboard.calculator.stats.apiCalls")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(apiCalls)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("dashboard.calculator.stats.memories")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(memories)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("dashboard.calculator.stats.extractions")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(extractions)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("dashboard.calculator.stats.estimated")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(recommendedTier.totalCost)}/mo</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Usage Inputs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Presets */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t("dashboard.calculator.presets.title")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {usagePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedPreset === preset.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t(`calculator.presets.${preset.id}`)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatNumber(preset.apiCalls)} calls
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              {t("dashboard.calculator.customize.title")}
            </h3>
            <div className="space-y-8">
              {/* API Calls Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("dashboard.calculator.labels.apiCalls")}
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatNumber(apiCalls)} / mo
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2000000"
                  step="1000"
                  value={apiCalls}
                  onChange={(e) => {
                    setApiCalls(Number(e.target.value));
                    setSelectedPreset(null);
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>500K</span>
                  <span>1M</span>
                  <span>1.5M</span>
                  <span>2M</span>
                </div>
              </div>

              {/* Memories Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("dashboard.calculator.labels.memories")}
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatNumber(memories)} / mo
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500000"
                  step="100"
                  value={memories}
                  onChange={(e) => {
                    setMemories(Number(e.target.value));
                    setSelectedPreset(null);
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>125K</span>
                  <span>250K</span>
                  <span>375K</span>
                  <span>500K</span>
                </div>
              </div>

              {/* Extractions Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("dashboard.calculator.labels.extractions")}
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatNumber(extractions)} / mo
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200000"
                  step="50"
                  value={extractions}
                  onChange={(e) => {
                    setExtractions(Number(e.target.value));
                    setSelectedPreset(null);
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>50K</span>
                  <span>100K</span>
                  <span>150K</span>
                  <span>200K</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="space-y-6">
          {/* Recommended Plan */}
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span className="text-sm font-medium opacity-90">{t("dashboard.calculator.recommended.title")}</span>
            </div>
            <h3 className="text-3xl font-bold mb-2">{recommendedTier.tier.name}</h3>
            <p className="text-4xl font-bold mb-4">
              {formatCurrency(recommendedTier.totalCost)}
              <span className="text-lg font-normal opacity-75">/mo</span>
            </p>
            <div className="space-y-2 text-sm opacity-90">
              <div className="flex justify-between">
                <span>{t("dashboard.calculator.recommended.base")}</span>
                <span>{formatCurrency(recommendedTier.tier.basePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("dashboard.calculator.recommended.overage")}</span>
                <span>{formatCurrency(recommendedTier.overageCost)}</span>
              </div>
            </div>
            <button className="w-full mt-6 bg-white text-blue-600 font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-50 transition-colors">
              {t("dashboard.calculator.recommended.cta")}
            </button>
          </div>

          {/* All Plans Comparison */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t("dashboard.calculator.comparison.title")}
            </h3>
            <div className="space-y-3">
              {calculations.map((calc) => (
                <div
                  key={calc.tier.id}
                  className={`p-3 rounded-lg border transition-all ${
                    calc.tier.id === recommendedTier.tier.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {calc.tier.name}
                        {calc.tier.id === recommendedTier.tier.id && (
                          <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                            {t("dashboard.calculator.comparison.best")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatNumber(calc.tier.includedCalls)} calls included
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(calc.totalCost)}
                      </p>
                      {calc.overageCost > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          +{formatCurrency(calc.overageCost)} overage
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Details Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("dashboard.calculator.details.title")}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.plan")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.base")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.includedCalls")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.overageRate")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.yourOverage")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("dashboard.calculator.details.total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {calculations.map((calc) => (
                <tr
                  key={calc.tier.id}
                  className={
                    calc.tier.id === recommendedTier.tier.id
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {calc.tier.name}
                      </span>
                      {calc.tier.id === recommendedTier.tier.id && (
                        <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          Best
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatCurrency(calc.tier.basePrice)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatNumber(calc.tier.includedCalls)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    ${calc.tier.overageCallRate}/call
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {calc.overageCost > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {formatCurrency(calc.overageCost)}
                      </span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">$0.00</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(calc.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
