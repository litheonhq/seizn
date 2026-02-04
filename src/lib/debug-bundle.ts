/**
 * Debug Bundle Utility
 * Generates exportable debug bundles for traces with PII redaction and replay commands
 */

import { redactTrace, type TraceSnapshot, type RedactionProfile, DEFAULT_REDACTION_PROFILE } from './sharing';

// ============================================
// Types
// ============================================

export interface DebugBundleOptions {
  /** Redaction profile to apply */
  redactionProfile?: Partial<RedactionProfile>;
  /** Include replay command snippets */
  includeReplayCommands?: boolean;
  /** Include environment info */
  includeEnvironment?: boolean;
  /** Format for export */
  format?: 'json' | 'markdown';
}

export interface EnvironmentInfo {
  sdkVersion: string;
  pricingVersion: string;
  nodeVersion?: string;
  timestamp: string;
  timezone: string;
}

export interface ReplayCommand {
  language: 'curl' | 'javascript' | 'python';
  code: string;
  description: string;
}

export interface DebugBundle {
  /** Bundle metadata */
  meta: {
    bundleId: string;
    createdAt: string;
    traceId: string;
    format: 'json' | 'markdown';
    redactionApplied: boolean;
  };
  /** Redacted trace snapshot */
  trace: TraceSnapshot;
  /** Replay commands for reproducing the request */
  replayCommands: ReplayCommand[];
  /** Environment information */
  environment: EnvironmentInfo;
  /** Error logs (PII removed) */
  errorLogs: string[];
  /** Checklist for debugging */
  checklist: ChecklistItem[];
}

export interface ChecklistItem {
  label: string;
  value: string | boolean | number;
  status: 'ok' | 'warning' | 'error' | 'info';
}

// ============================================
// Constants
// ============================================

const CURRENT_SDK_VERSION = '1.0.0';
const CURRENT_PRICING_VERSION = 'v2024.01';

// ============================================
// Helper Functions
// ============================================

/**
 * Generate unique bundle ID
 */
function generateBundleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dbg_${timestamp}_${random}`;
}

/**
 * Extract error logs from trace and redact PII
 */
function extractErrorLogs(trace: TraceSnapshot, profile: RedactionProfile): string[] {
  const logs: string[] = [];

  // Check main error
  if (trace.error) {
    logs.push(`[ERROR] ${trace.error}`);
  }

  // Check trace events for errors
  if (trace.trace?.events) {
    for (const event of trace.trace.events) {
      if (event.name.toLowerCase().includes('error') || event.stage === 'validate') {
        const details = event.details ? JSON.stringify(event.details) : '';
        if (details) {
          logs.push(`[${event.stage.toUpperCase()}] ${event.name}: ${details}`);
        }
      }
    }
  }

  // Apply redaction if needed
  if (profile.pii || profile.secrets) {
    return logs.map(log => {
      let redacted = log;
      // Apply basic PII patterns
      if (profile.pii) {
        // Mask emails
        redacted = redacted.replace(/([a-zA-Z0-9._%+-]{1,64})@([a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63})/g, '[EMAIL]');
        // Mask phone numbers
        redacted = redacted.replace(/(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}/g, '[PHONE]');
        // Mask IPs
        redacted = redacted.replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '[IP]');
      }
      if (profile.secrets) {
        // Mask API keys
        redacted = redacted.replace(/\b(sk|pk|api|key|token|secret)[-_]?[a-zA-Z0-9]{16,}\b/gi, '[SECRET]');
      }
      return redacted;
    });
  }

  return logs;
}

/**
 * Generate replay commands for the trace
 */
function generateReplayCommands(trace: TraceSnapshot): ReplayCommand[] {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com';
  const query = trace.query_text || 'YOUR_QUERY_HERE';
  const config = trace.effective_config || {};

  const commands: ReplayCommand[] = [];

  // Curl command
  commands.push({
    language: 'curl',
    description: 'Replay this exact request using curl',
    code: `curl -X POST "${baseUrl}/api/retrieval/query" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "query": "${query.replace(/"/g, '\\"')}",
    "top_k": ${config.topK || 10},
    "search_type": "${config.searchType || 'semantic'}",
    "hybrid_alpha": ${config.hybridAlpha || 0.5},
    "rerank_enabled": ${config.rerankEnabled || false},
    "rerank_model": "${config.rerankModel || 'cohere-rerank-v3'}",
    "collection": "${trace.collection_id || 'default'}"
  }'`,
  });

  // JavaScript command
  commands.push({
    language: 'javascript',
    description: 'Replay this exact request using JavaScript/TypeScript',
    code: `import { Seizn } from 'seizn';

const client = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

const result = await client.query({
  query: "${query.replace(/"/g, '\\"')}",
  topK: ${config.topK || 10},
  searchType: "${config.searchType || 'semantic'}",
  hybridAlpha: ${config.hybridAlpha || 0.5},
  rerankEnabled: ${config.rerankEnabled || false},
  rerankModel: "${config.rerankModel || 'cohere-rerank-v3'}",
  collection: "${trace.collection_id || 'default'}",
});

console.log(result);`,
  });

  // Python command
  commands.push({
    language: 'python',
    description: 'Replay this exact request using Python',
    code: `from seizn import Seizn
import os

client = Seizn(api_key=os.environ["SEIZN_API_KEY"])

result = client.query(
    query="${query.replace(/"/g, '\\"')}",
    top_k=${config.topK || 10},
    search_type="${config.searchType || 'semantic'}",
    hybrid_alpha=${config.hybridAlpha || 0.5},
    rerank_enabled=${config.rerankEnabled ? 'True' : 'False'},
    rerank_model="${config.rerankModel || 'cohere-rerank-v3'}",
    collection="${trace.collection_id || 'default'}",
)

print(result)`,
  });

  return commands;
}

/**
 * Generate environment info
 */
function generateEnvironmentInfo(): EnvironmentInfo {
  return {
    sdkVersion: CURRENT_SDK_VERSION,
    pricingVersion: CURRENT_PRICING_VERSION,
    nodeVersion: typeof process !== 'undefined' ? process.version : undefined,
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Generate debugging checklist
 */
function generateChecklist(trace: TraceSnapshot, env: EnvironmentInfo): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];
  const config = trace.effective_config || {};
  const timings = trace.timings_ms || {};

  // SDK Version check
  checklist.push({
    label: 'SDK Version',
    value: env.sdkVersion,
    status: 'info',
  });

  // Pricing Version check
  checklist.push({
    label: 'Pricing Version',
    value: env.pricingVersion,
    status: 'info',
  });

  // Query presence
  checklist.push({
    label: 'Query Text',
    value: trace.query_text ? 'Present' : 'Missing',
    status: trace.query_text ? 'ok' : 'warning',
  });

  // Collection check
  checklist.push({
    label: 'Collection',
    value: trace.collection_id || 'default',
    status: trace.collection_id ? 'ok' : 'info',
  });

  // Results count
  checklist.push({
    label: 'Results Count',
    value: trace.results_count || 0,
    status: (trace.results_count || 0) > 0 ? 'ok' : 'warning',
  });

  // Latency check
  const totalLatency = Object.values(timings).reduce((a, b) => a + b, 0);
  checklist.push({
    label: 'Total Latency',
    value: `${totalLatency}ms`,
    status: totalLatency < 500 ? 'ok' : totalLatency < 2000 ? 'warning' : 'error',
  });

  // Error check
  checklist.push({
    label: 'Error Status',
    value: trace.error ? trace.error : 'No errors',
    status: trace.error ? 'error' : 'ok',
  });

  // Autopilot check
  checklist.push({
    label: 'Autopilot',
    value: trace.autopilot_reason || 'Not used',
    status: trace.autopilot_reason ? 'info' : 'info',
  });

  // Rerank check
  checklist.push({
    label: 'Rerank Enabled',
    value: config.rerankEnabled ? 'Yes' : 'No',
    status: 'info',
  });

  // Search type
  checklist.push({
    label: 'Search Type',
    value: typeof config.searchType === 'string' ? config.searchType : 'semantic',
    status: 'info',
  });

  // Top K
  checklist.push({
    label: 'Top K',
    value: typeof config.topK === 'number' ? config.topK : 10,
    status: 'info',
  });

  // Embedding model
  checklist.push({
    label: 'Embedding Model',
    value: typeof config.embeddingModel === 'string' ? config.embeddingModel : 'default',
    status: 'info',
  });

  return checklist;
}

/**
 * Format bundle as markdown
 */
function formatAsMarkdown(bundle: DebugBundle): string {
  const lines: string[] = [];

  lines.push(`# Debug Bundle: ${bundle.meta.bundleId}`);
  lines.push('');
  lines.push(`**Trace ID:** \`${bundle.meta.traceId}\``);
  lines.push(`**Created:** ${bundle.meta.createdAt}`);
  lines.push(`**Redaction Applied:** ${bundle.meta.redactionApplied ? 'Yes' : 'No'}`);
  lines.push('');

  // Environment
  lines.push('## Environment');
  lines.push('');
  lines.push(`- SDK Version: ${bundle.environment.sdkVersion}`);
  lines.push(`- Pricing Version: ${bundle.environment.pricingVersion}`);
  if (bundle.environment.nodeVersion) {
    lines.push(`- Node Version: ${bundle.environment.nodeVersion}`);
  }
  lines.push(`- Timezone: ${bundle.environment.timezone}`);
  lines.push('');

  // Checklist
  lines.push('## Debugging Checklist');
  lines.push('');
  lines.push('| Check | Value | Status |');
  lines.push('|-------|-------|--------|');
  for (const item of bundle.checklist) {
    const statusIcon = item.status === 'ok' ? 'OK' :
                       item.status === 'warning' ? 'WARNING' :
                       item.status === 'error' ? 'ERROR' : 'INFO';
    lines.push(`| ${item.label} | ${item.value} | ${statusIcon} |`);
  }
  lines.push('');

  // Error logs
  if (bundle.errorLogs.length > 0) {
    lines.push('## Error Logs');
    lines.push('');
    lines.push('```');
    for (const log of bundle.errorLogs) {
      lines.push(log);
    }
    lines.push('```');
    lines.push('');
  }

  // Replay commands
  lines.push('## Replay Commands');
  lines.push('');
  for (const cmd of bundle.replayCommands) {
    lines.push(`### ${cmd.language.charAt(0).toUpperCase() + cmd.language.slice(1)}`);
    lines.push('');
    lines.push(cmd.description);
    lines.push('');
    lines.push('```' + (cmd.language === 'curl' ? 'bash' : cmd.language));
    lines.push(cmd.code);
    lines.push('```');
    lines.push('');
  }

  // Trace snapshot (simplified)
  lines.push('## Trace Snapshot');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    id: bundle.trace.id,
    request_id: bundle.trace.request_id,
    plan: bundle.trace.plan,
    collection_id: bundle.trace.collection_id,
    query_text: bundle.trace.query_text,
    results_count: bundle.trace.results_count,
    effective_config: bundle.trace.effective_config,
    timings_ms: bundle.trace.timings_ms,
    error: bundle.trace.error,
  }, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ============================================
// Main Export Function
// ============================================

/**
 * Generate a debug bundle from a trace snapshot
 */
export function generateDebugBundle(
  trace: TraceSnapshot,
  options: DebugBundleOptions = {}
): DebugBundle {
  const redactionProfile: RedactionProfile = {
    ...DEFAULT_REDACTION_PROFILE,
    ...options.redactionProfile,
  };

  const format = options.format || 'json';
  const includeReplayCommands = options.includeReplayCommands !== false;
  const includeEnvironment = options.includeEnvironment !== false;

  // Apply redaction to trace
  const redactedTrace = redactTrace(trace, redactionProfile);

  // Generate environment info
  const environment = includeEnvironment ? generateEnvironmentInfo() : {
    sdkVersion: CURRENT_SDK_VERSION,
    pricingVersion: CURRENT_PRICING_VERSION,
    timestamp: new Date().toISOString(),
    timezone: 'UTC',
  };

  // Generate replay commands
  const replayCommands = includeReplayCommands
    ? generateReplayCommands(redactedTrace)
    : [];

  // Extract error logs
  const errorLogs = extractErrorLogs(trace, redactionProfile);

  // Generate checklist
  const checklist = generateChecklist(redactedTrace, environment);

  return {
    meta: {
      bundleId: generateBundleId(),
      createdAt: new Date().toISOString(),
      traceId: trace.id,
      format,
      redactionApplied: redactionProfile.pii || redactionProfile.secrets || redactionProfile.raw_content,
    },
    trace: redactedTrace,
    replayCommands,
    environment,
    errorLogs,
    checklist,
  };
}

/**
 * Export debug bundle as string (JSON or Markdown)
 */
export function exportDebugBundle(bundle: DebugBundle): string {
  if (bundle.meta.format === 'markdown') {
    return formatAsMarkdown(bundle);
  }
  return JSON.stringify(bundle, null, 2);
}

/**
 * Generate file name for debug bundle
 */
export function getDebugBundleFilename(bundle: DebugBundle): string {
  const date = new Date().toISOString().split('T')[0];
  const ext = bundle.meta.format === 'markdown' ? 'md' : 'json';
  return `seizn-debug-${bundle.meta.traceId.substring(0, 8)}-${date}.${ext}`;
}
