"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface ROIReport {
  period: string;
  generated_at: string;
  summary: {
    total_queries: number;
    total_cost_usd: number;
    avg_latency_ms: number;
    avg_cost_per_query_usd: number;
  };
  rerank_comparison: {
    enabled: { count: number; avg_latency_ms: number; avg_cost_usd: number; avg_mrr: number };
    disabled: { count: number; avg_latency_ms: number; avg_cost_usd: number; avg_mrr: number };
    impact: { latency_delta_ms: number; cost_delta_usd: number; mrr_improvement: number };
  };
  autopilot_comparison: {
    enabled: { count: number; avg_latency_ms: number; avg_cost_usd: number };
    disabled: { count: number; avg_latency_ms: number; avg_cost_usd: number };
    savings: { cost_saved_usd: number; cost_saved_percent: number };
  };
  projections: {
    estimated_annual_cost_usd: number;
    estimated_annual_savings_usd: number;
    savings_percent: number;
  };
  recommendations: string[];
}

export function ROIReportClient() {
  const [report, setReport] = useState<ROIReport | null>(null);
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const { t } = useDashboardTranslation();

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/roi?period=${period}`);
      const data = await response.json();
      if (data.success) {
        setReport(data.report);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-gray-500">{t("dashboard.reportsPage.loadError")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.reportsPage.title")}</h1>
          <p className="text-gray-500 mt-1">
            {t("dashboard.reportsPage.generated")} {new Date(report.generated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="7d">{t("dashboard.reportsPage.period7d")}</option>
            <option value="30d">{t("dashboard.reportsPage.period30d")}</option>
            <option value="90d">{t("dashboard.reportsPage.period90d")}</option>
          </select>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            {t("dashboard.reportsPage.exportPdf")}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label={t("dashboard.reportsPage.totalQueries")}
          value={report.summary.total_queries.toLocaleString()}
          icon="📊"
        />
        <SummaryCard
          label={t("dashboard.reportsPage.totalCost")}
          value={`$${report.summary.total_cost_usd.toFixed(2)}`}
          icon="💰"
        />
        <SummaryCard
          label={t("dashboard.reportsPage.avgLatency")}
          value={`${report.summary.avg_latency_ms}ms`}
          icon="⚡"
        />
        <SummaryCard
          label={t("dashboard.reportsPage.costPerQuery")}
          value={`$${report.summary.avg_cost_per_query_usd.toFixed(6)}`}
          icon="📈"
        />
      </div>

      {/* Projections Banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl p-6 mb-8 text-white">
        <div className="grid grid-cols-3 gap-8">
          <div>
            <p className="text-emerald-100 text-sm">{t("dashboard.reportsPage.estAnnualCost")}</p>
            <p className="text-3xl font-bold">
              ${report.projections.estimated_annual_cost_usd.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-emerald-100 text-sm">{t("dashboard.reportsPage.projAnnualSavings")}</p>
            <p className="text-3xl font-bold">
              ${report.projections.estimated_annual_savings_usd.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-emerald-100 text-sm">{t("dashboard.reportsPage.savingsRate")}</p>
            <p className="text-3xl font-bold">
              {report.projections.savings_percent.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Comparisons Grid */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Rerank Comparison */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("dashboard.reportsPage.rerankImpact")}</h3>

          <div className="space-y-4">
            <ComparisonRow
              label={t("dashboard.reportsPage.avgLatency")}
              valueA={`${report.rerank_comparison.disabled.avg_latency_ms}ms`}
              valueB={`${report.rerank_comparison.enabled.avg_latency_ms}ms`}
              delta={`+${report.rerank_comparison.impact.latency_delta_ms}ms`}
              deltaPositive={false}
            />
            <ComparisonRow
              label={t("dashboard.reportsPage.avgCost")}
              valueA={`$${report.rerank_comparison.disabled.avg_cost_usd.toFixed(6)}`}
              valueB={`$${report.rerank_comparison.enabled.avg_cost_usd.toFixed(6)}`}
              delta={`+$${report.rerank_comparison.impact.cost_delta_usd.toFixed(6)}`}
              deltaPositive={false}
            />
            <ComparisonRow
              label={t("dashboard.reportsPage.mrrScore")}
              valueA={report.rerank_comparison.disabled.avg_mrr.toFixed(2)}
              valueB={report.rerank_comparison.enabled.avg_mrr.toFixed(2)}
              delta={`+${(report.rerank_comparison.impact.mrr_improvement * 100).toFixed(1)}%`}
              deltaPositive={true}
            />
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{t("dashboard.reportsPage.queries")}</span>{" "}
              {report.rerank_comparison.disabled.count} {t("dashboard.reportsPage.without")} /{" "}
              {report.rerank_comparison.enabled.count} {t("dashboard.reportsPage.withRerank")}
            </p>
          </div>
        </div>

        {/* Autopilot Comparison */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("dashboard.reportsPage.autopilotSavings")}</h3>

          <div className="space-y-4">
            <ComparisonRow
              label={t("dashboard.reportsPage.avgLatency")}
              valueA={`${report.autopilot_comparison.disabled.avg_latency_ms}ms`}
              valueB={`${report.autopilot_comparison.enabled.avg_latency_ms}ms`}
              delta={`-${report.autopilot_comparison.disabled.avg_latency_ms - report.autopilot_comparison.enabled.avg_latency_ms}ms`}
              deltaPositive={true}
            />
            <ComparisonRow
              label={t("dashboard.reportsPage.avgCost")}
              valueA={`$${report.autopilot_comparison.disabled.avg_cost_usd.toFixed(6)}`}
              valueB={`$${report.autopilot_comparison.enabled.avg_cost_usd.toFixed(6)}`}
              delta={`-${report.autopilot_comparison.savings.cost_saved_percent.toFixed(0)}%`}
              deltaPositive={true}
            />
          </div>

          <div className="mt-6 p-4 bg-emerald-50 rounded-xl">
            <p className="text-sm text-emerald-700">
              <span className="font-bold text-emerald-900">
                ${report.autopilot_comparison.savings.cost_saved_usd.toFixed(2)}
              </span>{" "}
              {t("dashboard.reportsPage.savedThisPeriod")}
            </p>
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{t("dashboard.reportsPage.queries")}</span>{" "}
              {report.autopilot_comparison.disabled.count} {t("dashboard.reportsPage.without")} /{" "}
              {report.autopilot_comparison.enabled.count} {t("dashboard.reportsPage.withAutopilot")}
            </p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-2xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t("dashboard.reportsPage.recommendations")}</h3>
        <div className="space-y-3">
          {report.recommendations.map((rec, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg"
            >
              <span className="text-blue-500 mt-0.5">💡</span>
              <p className="text-sm text-blue-800">{rec}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  delta,
  deltaPositive,
}: {
  label: string;
  valueA: string;
  valueB: string;
  delta: string;
  deltaPositive: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-sm font-mono text-gray-500">{valueA}</span>
        <span className="text-gray-300">→</span>
        <span className="text-sm font-mono text-gray-900">{valueB}</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            deltaPositive
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {delta}
        </span>
      </div>
    </div>
  );
}
