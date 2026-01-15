"use client";

import { useEffect } from "react";

const RUM_ENDPOINT = "/api/rum";

type MetricPayload = {
  id: string;
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  navigationType?: string;
  url: string;
  userAgent: string;
  timestamp: string;
};

function sendMetric(payload: MetricPayload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(RUM_ENDPOINT, body);
    return;
  }

  fetch(RUM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore client-side reporting failures
  });
}

export function WebVitalsReporter() {
  useEffect(() => {
    let isActive = true;

    const report = (metric: { id: string; name: string; value: number; rating?: string; delta?: number; navigationType?: string }) => {
      if (!isActive) return;
      sendMetric({
        id: metric.id,
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    import("web-vitals").then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      onCLS(report);
      onINP(report);
      onLCP(report);
      onFCP(report);
      onTTFB(report);
    });

    return () => {
      isActive = false;
    };
  }, []);

  return null;
}
