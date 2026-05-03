"use client";

import { useEffect } from "react";
import type { MetricWithAttribution } from "web-vitals/attribution";

const RUM_ENDPOINT = "/api/rum";
const LOAF_REPORTING_THRESHOLD_MS = 100;
const MAX_LOAF_REPORTS_PER_PAGE = 5;

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
  entryType?: "web-vital" | "long-animation-frame";
  attribution?: Record<string, unknown>;
};

function sendMetric(payload: MetricPayload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.(RUM_ENDPOINT, body)) {
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

type WebVitalsMetric = MetricWithAttribution;

type PerformanceLongAnimationFrameScript = {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  duration?: number;
  forcedStyleAndLayoutDuration?: number;
  pauseDuration?: number;
};

type PerformanceLongAnimationFrameEntry = PerformanceEntry & {
  renderStart?: number;
  blockingDuration?: number;
  scripts?: PerformanceLongAnimationFrameScript[];
};

function getSafePath() {
  return window.location.pathname;
}

function sanitizeSourceUrl(sourceURL?: string) {
  if (!sourceURL) return undefined;

  try {
    const source = new URL(sourceURL, window.location.origin);
    if (source.origin === window.location.origin) {
      return source.pathname;
    }
    return `${source.origin}${source.pathname}`;
  } catch {
    return sourceURL.slice(0, 160);
  }
}

function summarizeLoafEntry(entry: PerformanceLongAnimationFrameEntry) {
  const topScripts = [...(entry.scripts ?? [])]
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    .slice(0, 3)
    .map((script) => ({
      invoker: script.invoker,
      invokerType: script.invokerType,
      sourceURL: sanitizeSourceUrl(script.sourceURL),
      sourceFunctionName: script.sourceFunctionName,
      duration: script.duration,
      forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
      pauseDuration: script.pauseDuration,
    }));

  return {
    startTime: entry.startTime,
    duration: entry.duration,
    renderStart: entry.renderStart,
    blockingDuration: entry.blockingDuration,
    scripts: topScripts,
  };
}

function getMetricAttribution(metric: WebVitalsMetric): Record<string, unknown> | undefined {
  if (metric.name !== "INP" || !metric.attribution) {
    return undefined;
  }

  const loafEntries = [...(metric.attribution.longAnimationFrameEntries ?? [])] as PerformanceLongAnimationFrameEntry[];
  const longestLongAnimationFrame = loafEntries.sort(
    (a, b) => (b.blockingDuration ?? b.duration) - (a.blockingDuration ?? a.duration)
  )[0];

  return {
    interactionTarget: metric.attribution.interactionTarget,
    interactionType: metric.attribution.interactionType,
    inputDelay: metric.attribution.inputDelay,
    processingDuration: metric.attribution.processingDuration,
    presentationDelay: metric.attribution.presentationDelay,
    loadState: metric.attribution.loadState,
    longAnimationFrameCount: loafEntries.length,
    longestLongAnimationFrame: longestLongAnimationFrame ? summarizeLoafEntry(longestLongAnimationFrame) : undefined,
  };
}

export function WebVitalsReporter() {
  useEffect(() => {
    let isActive = true;
    let reportedLoafCount = 0;
    let longAnimationFrameObserver: PerformanceObserver | null = null;

    const report = (metric: WebVitalsMetric) => {
      if (!isActive) return;
      sendMetric({
        id: metric.id,
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        url: getSafePath(),
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        entryType: "web-vital",
        attribution: getMetricAttribution(metric),
      });
    };

    import("web-vitals/attribution")
      .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
        onCLS((metric) => report(metric));
        onINP((metric) => report(metric));
        onLCP((metric) => report(metric));
        onFCP((metric) => report(metric));
        onTTFB((metric) => report(metric));
      })
      .catch(() => {
        // Observability should never block page interaction.
      });

    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")
    ) {
      longAnimationFrameObserver = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          if (!isActive || reportedLoafCount >= MAX_LOAF_REPORTS_PER_PAGE) return;

          const entry = rawEntry as PerformanceLongAnimationFrameEntry;
          const blockingDuration = entry.blockingDuration ?? 0;
          if (blockingDuration < LOAF_REPORTING_THRESHOLD_MS) continue;

          reportedLoafCount += 1;
          sendMetric({
            id: `loaf-${Date.now()}-${reportedLoafCount}`,
            name: "LoAF",
            value: blockingDuration,
            rating: blockingDuration >= 200 ? "poor" : "needs-improvement",
            url: getSafePath(),
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            entryType: "long-animation-frame",
            attribution: summarizeLoafEntry(entry),
          });
        }
      });

      longAnimationFrameObserver.observe({ type: "long-animation-frame", buffered: true });
    }

    return () => {
      isActive = false;
      longAnimationFrameObserver?.disconnect();
    };
  }, []);

  return null;
}
