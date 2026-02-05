/**
 * Browser Telemetry
 *
 * OpenTelemetry-based browser telemetry for Real User Monitoring (RUM).
 *
 * @module lib/telemetry/browser-telemetry
 */

// =============================================================================
// Types
// =============================================================================

export interface TelemetryConfig {
  /** Service name for tracing */
  serviceName?: string;
  /** Endpoint for sending traces */
  endpoint?: string;
  /** Sample rate (0-1) */
  sampleRate?: number;
  /** Whether to collect performance metrics */
  collectPerformance?: boolean;
  /** Whether to collect errors */
  collectErrors?: boolean;
  /** Whether to collect user interactions */
  collectInteractions?: boolean;
  /** Custom attributes to add to all spans */
  customAttributes?: Record<string, string | number | boolean>;
}

export interface Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: 'ok' | 'error' | 'unset';
  parentSpanId?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

// =============================================================================
// Browser Telemetry Class
// =============================================================================

class BrowserTelemetry {
  private config: Required<TelemetryConfig>;
  private spans: Span[] = [];
  private metrics: PerformanceMetric[] = [];
  private activeSpans: Map<string, Span> = new Map();
  private isInitialized = false;

  constructor(config: TelemetryConfig = {}) {
    this.config = {
      serviceName: config.serviceName || 'seizn-web',
      endpoint: config.endpoint || '/api/telemetry',
      sampleRate: config.sampleRate ?? 0.1,
      collectPerformance: config.collectPerformance ?? true,
      collectErrors: config.collectErrors ?? true,
      collectInteractions: config.collectInteractions ?? true,
      customAttributes: config.customAttributes || {},
    };
  }

  /**
   * Initialize telemetry
   */
  init(): void {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.isInitialized = true;

    // Collect performance metrics
    if (this.config.collectPerformance) {
      this.collectPerformanceMetrics();
    }

    // Set up error tracking
    if (this.config.collectErrors) {
      this.setupErrorTracking();
    }

    // Set up interaction tracking
    if (this.config.collectInteractions) {
      this.setupInteractionTracking();
    }

    // Set up periodic flush
    setInterval(() => this.flush(), 30000);

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush());

    console.log('[Telemetry] Initialized');
  }

  /**
   * Start a new span
   */
  startSpan(name: string, attributes: Record<string, unknown> = {}): string {
    if (!this.shouldSample()) return '';

    const spanId = this.generateId();
    const span: Span = {
      name,
      startTime: performance.now(),
      attributes: { ...this.config.customAttributes, ...attributes },
      events: [],
      status: 'unset',
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = performance.now();
    span.status = status;

    this.spans.push(span);
    this.activeSpans.delete(spanId);
  }

  /**
   * Add event to active span
   */
  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: performance.now(),
      attributes,
    });
  }

  /**
   * Record a metric
   */
  recordMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    attributes?: Record<string, unknown>
  ): void {
    if (!this.shouldSample()) return;

    this.metrics.push({
      name,
      value,
      unit,
      timestamp: Date.now(),
      attributes: { ...this.config.customAttributes, ...attributes },
    });
  }

  /**
   * Track a user interaction
   */
  trackInteraction(
    type: string,
    target: string,
    attributes?: Record<string, unknown>
  ): void {
    this.recordMetric(`interaction.${type}`, 1, 'count', {
      target,
      ...attributes,
    });
  }

  /**
   * Track an error
   */
  trackError(error: Error, context?: Record<string, unknown>): void {
    this.recordMetric('error', 1, 'count', {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      ...context,
    });
  }

  /**
   * Flush telemetry data to server
   */
  async flush(): Promise<void> {
    if (this.spans.length === 0 && this.metrics.length === 0) return;

    const data = {
      spans: [...this.spans],
      metrics: [...this.metrics],
      timestamp: Date.now(),
      serviceName: this.config.serviceName,
    };

    this.spans = [];
    this.metrics = [];

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      });
    } catch (error) {
      console.error('[Telemetry] Flush failed:', error);
    }
  }

  /**
   * Collect Web Vitals and performance metrics
   */
  private collectPerformanceMetrics(): void {
    // Collect paint timing
    const paintEntries = performance.getEntriesByType('paint');
    for (const entry of paintEntries) {
      this.recordMetric(`paint.${entry.name}`, entry.startTime);
    }

    // Collect navigation timing
    if (performance.getEntriesByType('navigation').length > 0) {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      this.recordMetric('navigation.dns', nav.domainLookupEnd - nav.domainLookupStart);
      this.recordMetric('navigation.tcp', nav.connectEnd - nav.connectStart);
      this.recordMetric('navigation.ttfb', nav.responseStart - nav.requestStart);
      this.recordMetric('navigation.domInteractive', nav.domInteractive);
      this.recordMetric('navigation.domComplete', nav.domComplete);
    }

    // Observe Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.recordMetric('lcp', lastEntry.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // First Input Delay
        new PerformanceObserver((list) => {
          const entry = list.getEntries()[0] as PerformanceEventTiming;
          this.recordMetric('fid', entry.processingStart - entry.startTime);
        }).observe({ type: 'first-input', buffered: true });

        // Cumulative Layout Shift
        let clsValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as LayoutShiftEntry[]) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          this.recordMetric('cls', clsValue, 'score');
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // Observer not supported
      }
    }
  }

  /**
   * Set up error tracking
   */
  private setupErrorTracking(): void {
    window.addEventListener('error', (event) => {
      this.trackError(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
        { type: 'unhandledrejection' }
      );
    });
  }

  /**
   * Set up interaction tracking
   */
  private setupInteractionTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const trackable = target.closest('[data-track]');

      if (trackable) {
        const trackId = trackable.getAttribute('data-track');
        this.trackInteraction('click', trackId || 'unknown');
      }
    });
  }

  /**
   * Should sample this event
   */
  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

// =============================================================================
// Exports
// =============================================================================

// Singleton instance
let telemetryInstance: BrowserTelemetry | null = null;

export function initTelemetry(config?: TelemetryConfig): BrowserTelemetry {
  if (!telemetryInstance) {
    telemetryInstance = new BrowserTelemetry(config);
    telemetryInstance.init();
  }
  return telemetryInstance;
}

export function getTelemetry(): BrowserTelemetry | null {
  return telemetryInstance;
}

// Convenience exports
export const startSpan = (name: string, attributes?: Record<string, unknown>) =>
  telemetryInstance?.startSpan(name, attributes) || '';

export const endSpan = (spanId: string, status?: 'ok' | 'error') =>
  telemetryInstance?.endSpan(spanId, status);

export const recordMetric = (
  name: string,
  value: number,
  unit?: string,
  attributes?: Record<string, unknown>
) => telemetryInstance?.recordMetric(name, value, unit, attributes);

export const trackInteraction = (
  type: string,
  target: string,
  attributes?: Record<string, unknown>
) => telemetryInstance?.trackInteraction(type, target, attributes);

export const trackError = (error: Error, context?: Record<string, unknown>) =>
  telemetryInstance?.trackError(error, context);

// Type for Layout Shift
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}
