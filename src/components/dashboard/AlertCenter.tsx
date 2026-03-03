"use client";

import type { AlertItem } from "@/types/operations";

interface AlertCenterProps {
  alerts: AlertItem[];
  title?: string;
}

export function AlertCenter({ alerts, title = "Alert Center" }: AlertCenterProps) {
  if (alerts.length === 0) {
    return (
      <section className="szn-card" aria-label="Alert center">
        <h2 className="szn-card-title">{title}</h2>
        <p className="szn-muted text-sm">No active alerts.</p>
      </section>
    );
  }

  return (
    <section className="szn-card" aria-label="Alert center">
      <h2 className="szn-card-title">{title}</h2>
      <ul className="szn-list" role="list">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className={`szn-alert szn-alert-${alert.severity}`}
            role="listitem"
          >
            <div className="flex items-start justify-between gap-2">
              <strong className="text-sm">{alert.title}</strong>
              <SeverityBadge severity={alert.severity} />
            </div>
            <p className="text-sm szn-text-2 mt-1">{alert.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: AlertItem["severity"] }) {
  const styles = {
    high: "szn-badge-error",
    medium: "szn-badge-warning",
    low: "szn-badge-success",
  };

  return (
    <span className={`szn-badge ${styles[severity]}`}>
      {severity}
    </span>
  );
}
