/**
 * Seizn OTLP Exporter
 *
 * Exports Seizn traces to OTLP-compatible backends (Jaeger, Datadog, Grafana, etc.)
 */

import type {
  OTelConfig,
  SeizinSpanData,
  ExportResult,
  BatchExportResult,
} from './types';
import { loadOTelConfig, isOTelEnabled } from './config';
import { convertStoredTraceToOTel } from './converter';
import type { StoredTrace } from '../fall/flight-recorder/types';

// ============================================
// OTLP Protocol Types
// ============================================

interface OTLPResourceSpans {
  resource: {
    attributes: OTLPAttribute[];
  };
  scopeSpans: OTLPScopeSpan[];
}

interface OTLPScopeSpan {
  scope: {
    name: string;
    version: string;
  };
  spans: OTLPSpan[];
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  events: OTLPEvent[];
  links: OTLPLink[];
  status: {
    code: number;
    message?: string;
  };
}

interface OTLPAttribute {
  key: string;
  value: OTLPValue;
}

interface OTLPValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: {
    values: OTLPValue[];
  };
}

interface OTLPEvent {
  name: string;
  timeUnixNano: string;
  attributes?: OTLPAttribute[];
}

interface OTLPLink {
  traceId: string;
  spanId: string;
  attributes?: OTLPAttribute[];
}

// ============================================
// Exporter Class
// ============================================

export class OTLPExporter {
  private config: OTelConfig;
  private pendingSpans: SeizinSpanData[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private exportPromises: Promise<BatchExportResult>[] = [];

  constructor(config?: Partial<OTelConfig>) {
    this.config = { ...loadOTelConfig(), ...config };
  }

  /**
   * Export a single Seizn StoredTrace to OTLP
   */
  async exportTrace(trace: StoredTrace): Promise<ExportResult> {
    if (!this.config.enabled) {
      return {
        success: true,
        exportedCount: 0,
        failedCount: 0,
        errors: ['OTEL export is disabled'],
      };
    }

    const spans = convertStoredTraceToOTel(trace, this.config.serviceName);
    return this.exportSpans(spans);
  }

  /**
   * Export multiple traces
   */
  async exportTraces(traces: StoredTrace[]): Promise<ExportResult> {
    if (!this.config.enabled) {
      return {
        success: true,
        exportedCount: 0,
        failedCount: 0,
        errors: ['OTEL export is disabled'],
      };
    }

    const allSpans: SeizinSpanData[] = [];
    for (const trace of traces) {
      const spans = convertStoredTraceToOTel(trace, this.config.serviceName);
      allSpans.push(...spans);
    }

    return this.exportSpans(allSpans);
  }

  /**
   * Add spans to batch queue (for async batching)
   */
  queueSpans(spans: SeizinSpanData[]): void {
    if (!this.config.enabled) return;

    this.pendingSpans.push(...spans);

    // Start batch timer if not running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.config.batchInterval);
    }

    // Flush immediately if batch size exceeded
    if (this.pendingSpans.length >= (this.config.maxBatchSize || 512)) {
      this.flushBatch();
    }
  }

  /**
   * Queue a trace for batched export
   */
  queueTrace(trace: StoredTrace): void {
    if (!this.config.enabled) return;

    const spans = convertStoredTraceToOTel(trace, this.config.serviceName);
    this.queueSpans(spans);
  }

  /**
   * Flush pending spans immediately
   */
  async flushBatch(): Promise<BatchExportResult | null> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingSpans.length === 0) {
      return null;
    }

    const spansToExport = [...this.pendingSpans];
    this.pendingSpans = [];

    const startTime = Date.now();
    const batchId = crypto.randomUUID();

    try {
      const result = await this.exportSpans(spansToExport);
      const batchResult: BatchExportResult = {
        batchId,
        success: result.success,
        spans: spansToExport.length,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        endpoint: this.config.endpoint,
      };

      if (this.config.debug) {
        console.log('[OTLPExporter] Batch exported:', batchResult);
      }

      return batchResult;
    } catch (error) {
      const batchResult: BatchExportResult = {
        batchId,
        success: false,
        spans: spansToExport.length,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        endpoint: this.config.endpoint,
      };

      if (this.config.debug) {
        console.error('[OTLPExporter] Batch export failed:', error);
      }

      return batchResult;
    }
  }

  /**
   * Wait for all pending exports to complete
   */
  async shutdown(): Promise<void> {
    // Flush any remaining spans
    await this.flushBatch();

    // Wait for all export promises
    await Promise.all(this.exportPromises);
  }

  /**
   * Export spans to OTLP endpoint
   */
  private async exportSpans(spans: SeizinSpanData[]): Promise<ExportResult> {
    if (spans.length === 0) {
      return { success: true, exportedCount: 0, failedCount: 0 };
    }

    const payload = this.buildOTLPPayload(spans);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.exportTimeout || 30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OTLP export failed: ${response.status} ${errorText}`);
      }

      if (this.config.debug) {
        console.log('[OTLPExporter] Exported', spans.length, 'spans to', this.config.endpoint);
      }

      return {
        success: true,
        exportedCount: spans.length,
        failedCount: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.debug) {
        console.error('[OTLPExporter] Export error:', errorMessage);
      }

      return {
        success: false,
        exportedCount: 0,
        failedCount: spans.length,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Build OTLP JSON payload
   */
  private buildOTLPPayload(spans: SeizinSpanData[]): { resourceSpans: OTLPResourceSpans[] } {
    const resourceAttrs = this.buildResourceAttributes();
    const otlpSpans = spans.map((span) => this.convertToOTLPSpan(span));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: resourceAttrs,
          },
          scopeSpans: [
            {
              scope: {
                name: 'seizn-otel-exporter',
                version: '1.0.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Build resource attributes
   */
  private buildResourceAttributes(): OTLPAttribute[] {
    const attrs: OTLPAttribute[] = [
      { key: 'service.name', value: { stringValue: this.config.serviceName } },
    ];

    if (this.config.serviceVersion) {
      attrs.push({
        key: 'service.version',
        value: { stringValue: this.config.serviceVersion },
      });
    }

    if (this.config.environment) {
      attrs.push({
        key: 'deployment.environment',
        value: { stringValue: this.config.environment },
      });
    }

    return attrs;
  }

  /**
   * Convert SeizinSpanData to OTLP span format
   */
  private convertToOTLPSpan(span: SeizinSpanData): OTLPSpan {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.operationName,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: span.startTimeUnixNano.toString(),
      endTimeUnixNano: span.endTimeUnixNano.toString(),
      attributes: this.convertAttributes(span.attributes),
      events: span.events.map((event) => ({
        name: event.name,
        timeUnixNano: event.timeUnixNano.toString(),
        attributes: event.attributes ? this.convertAttributes(event.attributes) : undefined,
      })),
      links: span.links.map((link) => ({
        traceId: link.traceId,
        spanId: link.spanId,
        attributes: link.attributes ? this.convertAttributes(link.attributes) : undefined,
      })),
      status: {
        code: span.status === 'error' ? 2 : span.status === 'ok' ? 1 : 0,
        message: span.statusMessage,
      },
    };
  }

  /**
   * Convert attributes to OTLP format
   */
  private convertAttributes(attrs: Record<string, unknown>): OTLPAttribute[] {
    const result: OTLPAttribute[] = [];

    for (const [key, value] of Object.entries(attrs)) {
      const otlpValue = this.convertValue(value);
      if (otlpValue) {
        result.push({ key, value: otlpValue });
      }
    }

    return result;
  }

  /**
   * Convert a value to OTLP value format
   */
  private convertValue(value: unknown): OTLPValue | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return { stringValue: value };
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: value.toString() };
      }
      return { doubleValue: value };
    }

    if (typeof value === 'boolean') {
      return { boolValue: value };
    }

    if (Array.isArray(value)) {
      const values = value
        .map((item) => this.convertValue(item))
        .filter((v): v is OTLPValue => v !== null);

      if (values.length > 0) {
        return { arrayValue: { values } };
      }
    }

    return null;
  }
}

// ============================================
// Singleton Instance
// ============================================

let exporterInstance: OTLPExporter | null = null;

/**
 * Get the singleton OTLP exporter instance
 */
export function getOTLPExporter(): OTLPExporter {
  if (!exporterInstance) {
    exporterInstance = new OTLPExporter();
  }
  return exporterInstance;
}

/**
 * Reset the exporter instance (useful for testing)
 */
export function resetOTLPExporter(): void {
  if (exporterInstance) {
    exporterInstance.shutdown().catch(console.error);
    exporterInstance = null;
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Export a trace if OTEL is enabled
 */
export async function exportTraceToOTLP(trace: StoredTrace): Promise<ExportResult> {
  if (!isOTelEnabled()) {
    return { success: true, exportedCount: 0, failedCount: 0 };
  }

  return getOTLPExporter().exportTrace(trace);
}

/**
 * Queue a trace for batched export
 */
export function queueTraceForExport(trace: StoredTrace): void {
  if (!isOTelEnabled()) return;
  getOTLPExporter().queueTrace(trace);
}
