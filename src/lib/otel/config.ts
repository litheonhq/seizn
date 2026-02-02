/**
 * Seizn OpenTelemetry Configuration
 *
 * Configuration management for OTEL export.
 */

import type { OTelConfig } from './types';

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: OTelConfig = {
  enabled: false,
  endpoint: 'http://localhost:4318/v1/traces',
  serviceName: 'seizn',
  serviceVersion: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  batchInterval: 5000,
  maxBatchSize: 512,
  exportTimeout: 30000,
  debug: false,
};

// ============================================
// Configuration Loading
// ============================================

let cachedConfig: OTelConfig | null = null;

/**
 * Load OTEL configuration from environment variables
 */
export function loadOTelConfig(): OTelConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: OTelConfig = {
    enabled: process.env.OTEL_EXPORTER_ENABLED === 'true',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_CONFIG.endpoint,
    serviceName: process.env.OTEL_SERVICE_NAME || DEFAULT_CONFIG.serviceName,
    serviceVersion: process.env.OTEL_SERVICE_VERSION || DEFAULT_CONFIG.serviceVersion,
    environment: process.env.OTEL_ENVIRONMENT || DEFAULT_CONFIG.environment,
    batchInterval: parseInt(process.env.OTEL_BATCH_INTERVAL || String(DEFAULT_CONFIG.batchInterval)),
    maxBatchSize: parseInt(process.env.OTEL_MAX_BATCH_SIZE || String(DEFAULT_CONFIG.maxBatchSize)),
    exportTimeout: parseInt(process.env.OTEL_EXPORT_TIMEOUT || String(DEFAULT_CONFIG.exportTimeout)),
    debug: process.env.OTEL_DEBUG === 'true',
  };

  // Parse custom headers if provided
  const headersStr = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (headersStr) {
    config.headers = parseHeaders(headersStr);
  }

  cachedConfig = config;
  return config;
}

/**
 * Parse headers from environment variable format
 * Format: "key1=value1,key2=value2"
 */
function parseHeaders(headersStr: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const pairs = headersStr.split(',');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join('=').trim();
    }
  }

  return headers;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetOTelConfig(): void {
  cachedConfig = null;
}

/**
 * Override configuration programmatically
 */
export function setOTelConfig(config: Partial<OTelConfig>): void {
  cachedConfig = {
    ...loadOTelConfig(),
    ...config,
  };
}

/**
 * Check if OTEL export is enabled
 */
export function isOTelEnabled(): boolean {
  return loadOTelConfig().enabled;
}

// ============================================
// Validation
// ============================================

/**
 * Validate OTEL configuration
 */
export function validateOTelConfig(config: OTelConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.enabled) {
    if (!config.endpoint) {
      errors.push('OTEL endpoint is required when OTEL is enabled');
    }

    if (!config.serviceName) {
      errors.push('Service name is required');
    }

    try {
      new URL(config.endpoint);
    } catch {
      errors.push(`Invalid OTEL endpoint URL: ${config.endpoint}`);
    }

    if (config.batchInterval && config.batchInterval < 100) {
      errors.push('Batch interval must be at least 100ms');
    }

    if (config.maxBatchSize && config.maxBatchSize < 1) {
      errors.push('Max batch size must be at least 1');
    }

    if (config.exportTimeout && config.exportTimeout < 1000) {
      errors.push('Export timeout must be at least 1000ms');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the current OTEL configuration (alias for loadOTelConfig)
 */
export function getOTelConfig(): OTelConfig {
  return loadOTelConfig();
}
