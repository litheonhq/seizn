"use client";

import type { MetricCard } from "@/types/operations";

interface OperationsBoardProps {
  metrics: MetricCard[];
  title?: string;
  subtitle?: string;
}

export function OperationsBoard({ metrics, title, subtitle }: OperationsBoardProps) {
  return (
    <section className="space-y-4" aria-label="Operations overview">
      {/* Header card */}
      {(title || subtitle) && (
        <div className="szn-card">
          {title && <h2 className="szn-title">{title}</h2>}
          {subtitle && <p className="szn-muted mt-1">{subtitle}</p>}
        </div>
      )}

      {/* Metric cards grid */}
      <div className="szn-metrics-grid" role="list">
        {metrics.map((metric) => (
          <article key={metric.id} className="szn-card szn-card-hover" role="listitem">
            <p className="text-sm szn-text-3 font-medium">{metric.label}</p>
            <p className="szn-metric-value">{metric.value}</p>
            {metric.trend && <p className="text-sm szn-muted">{metric.trend}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

interface LiveBoardProps {
  rows: MetricCard[];
  title?: string;
}

export function LiveBoard({ rows, title = "Live Board" }: LiveBoardProps) {
  return (
    <section className="szn-card" aria-label="Live board">
      <h2 className="szn-card-title">{title}</h2>
      <div className="overflow-x-auto">
        <table className="szn-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Value</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.label}</td>
                <td className="font-semibold">{row.value}</td>
                <td className="szn-text-3">{row.trend ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
