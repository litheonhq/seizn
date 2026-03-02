"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";

// ============================================
// Types
// ============================================

interface ComponentDoc {
  id: string;
  name: string;
  category: "graph" | "explain" | "retops";
  path: string;
  props: PropDoc[];
}

interface PropDoc {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description: string;
}

// ============================================
// Component Documentation Data
// ============================================

const componentDocs: ComponentDoc[] = [
  // Graph Components
  {
    id: "graph-canvas",
    name: "GraphCanvas",
    category: "graph",
    path: "src/components/graph/GraphCanvas.tsx",
    props: [
      {
        name: "data",
        type: "GraphData",
        required: true,
        description: "Graph data to render (nodes and edges)",
      },
      {
        name: "onNodeSelect",
        type: "(nodeId: string | null) => void",
        required: false,
        description: "Callback when a node is selected",
      },
      {
        name: "onFilterChange",
        type: "(filter: GraphFilter) => void",
        required: false,
        description: "Callback when filter changes",
      },
      {
        name: "editable",
        type: "boolean",
        required: false,
        default: "false",
        description: "Enable editing mode for adding edges",
      },
      {
        name: "showMinimap",
        type: "boolean",
        required: false,
        default: "true",
        description: "Show navigation minimap",
      },
      {
        name: "showControls",
        type: "boolean",
        required: false,
        default: "true",
        description: "Show zoom/pan controls",
      },
      {
        name: "showPermissionPanel",
        type: "boolean",
        required: false,
        default: "true",
        description: "Show permission panel on node select",
      },
      {
        name: "layout",
        type: '"dagre" | "elk" | "force"',
        required: false,
        default: '"dagre"',
        description: "Layout algorithm for node positioning",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  {
    id: "node-renderer",
    name: "NodeRenderer",
    category: "graph",
    path: "src/components/graph/NodeRenderer.tsx",
    props: [
      {
        name: "data",
        type: "GraphNodeData",
        required: true,
        description: "Node data including label, type, status, and permissions",
      },
      {
        name: "selected",
        type: "boolean",
        required: false,
        default: "false",
        description: "Whether the node is currently selected",
      },
    ],
  },
  {
    id: "edge-renderer",
    name: "EdgeRenderer",
    category: "graph",
    path: "src/components/graph/EdgeRenderer.tsx",
    props: [
      {
        name: "data",
        type: "GraphEdgeData",
        required: true,
        description: "Edge data including type, direction, and style",
      },
      {
        name: "sourceX",
        type: "number",
        required: true,
        description: "X coordinate of source node",
      },
      {
        name: "sourceY",
        type: "number",
        required: true,
        description: "Y coordinate of source node",
      },
      {
        name: "targetX",
        type: "number",
        required: true,
        description: "X coordinate of target node",
      },
      {
        name: "targetY",
        type: "number",
        required: true,
        description: "Y coordinate of target node",
      },
    ],
  },
  {
    id: "graph-controls",
    name: "GraphControls",
    category: "graph",
    path: "src/components/graph/GraphControls.tsx",
    props: [
      {
        name: "filter",
        type: "GraphFilter",
        required: true,
        description: "Current filter state",
      },
      {
        name: "onFilterChange",
        type: "(filter: GraphFilter) => void",
        required: true,
        description: "Callback when filter changes",
      },
      {
        name: "graphMetadata",
        type: "GraphMetadata",
        required: false,
        description: "Graph metadata for filter options",
      },
    ],
  },
  {
    id: "permission-panel",
    name: "PermissionPanel",
    category: "graph",
    path: "src/components/graph/PermissionPanel.tsx",
    props: [
      {
        name: "node",
        type: "GraphNode",
        required: true,
        description: "Selected node to display permissions for",
      },
      {
        name: "onClose",
        type: "() => void",
        required: true,
        description: "Callback to close the panel",
      },
    ],
  },
  // Explain Components
  {
    id: "explain-panel",
    name: "ExplainPanel",
    category: "explain",
    path: "src/components/explain/ExplainPanel.tsx",
    props: [
      {
        name: "explanation",
        type: "RetrievalExplanation",
        required: true,
        description: "Explanation data from retrieval pipeline",
      },
      {
        name: "isExpanded",
        type: "boolean",
        required: false,
        default: "true",
        description: "Whether panel is expanded",
      },
      {
        name: "onToggle",
        type: "() => void",
        required: false,
        description: "Callback to toggle expansion",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  {
    id: "score-breakdown",
    name: "ScoreBreakdown",
    category: "explain",
    path: "src/components/explain/ScoreBreakdown.tsx",
    props: [
      {
        name: "breakdown",
        type: "ScoreBreakdownData",
        required: true,
        description: "Score breakdown data with component scores",
      },
      {
        name: "showDetails",
        type: "boolean",
        required: false,
        default: "true",
        description: "Show detailed score components",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  {
    id: "attribution-list",
    name: "AttributionList",
    category: "explain",
    path: "src/components/explain/AttributionList.tsx",
    props: [
      {
        name: "attributions",
        type: "AttributionInfo[]",
        required: true,
        description: "List of source attributions",
      },
      {
        name: "onAttributionClick",
        type: "(id: string) => void",
        required: false,
        description: "Callback when attribution is clicked",
      },
      {
        name: "maxItems",
        type: "number",
        required: false,
        default: "10",
        description: "Maximum items to display",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  {
    id: "highlighted-passage",
    name: "HighlightedPassage",
    category: "explain",
    path: "src/components/explain/HighlightedPassage.tsx",
    props: [
      {
        name: "content",
        type: "string",
        required: true,
        description: "Text content to display",
      },
      {
        name: "visualization",
        type: "PassageVisualization",
        required: false,
        description: "Highlight spans and match summary",
      },
      {
        name: "attribution",
        type: "AttributionInfo",
        required: false,
        description: "Attribution data to generate highlights from",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  // RetOps Components
  {
    id: "retops-dashboard",
    name: "RetOpsDashboard",
    category: "retops",
    path: "src/components/retops/RetOpsDashboard.tsx",
    props: [
      {
        name: "collectionId",
        type: "string",
        required: false,
        description: "Collection ID to filter metrics by",
      },
      {
        name: "refreshInterval",
        type: "number",
        required: false,
        default: "30",
        description: "Auto-refresh interval in seconds",
      },
      {
        name: "className",
        type: "string",
        required: false,
        description: "Custom CSS class name",
      },
    ],
  },
  {
    id: "metrics-overview",
    name: "MetricsOverview",
    category: "retops",
    path: "src/components/retops/MetricsOverview.tsx",
    props: [
      {
        name: "metrics",
        type: "RetOpsMetrics | null",
        required: true,
        description: "Metrics data (QPS, latency, cache, errors, quality)",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
    ],
  },
  {
    id: "query-volume-chart",
    name: "QueryVolumeChart",
    category: "retops",
    path: "src/components/retops/QueryVolumeChart.tsx",
    props: [
      {
        name: "stats",
        type: "RetrievalStats | null",
        required: true,
        description: "Retrieval statistics including search type distribution",
      },
      {
        name: "timeSeries",
        type: "TimeSeriesData | null",
        required: true,
        description: "Time series data for QPS and error rate",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
    ],
  },
  {
    id: "latency-distribution",
    name: "LatencyDistribution",
    category: "retops",
    path: "src/components/retops/LatencyDistribution.tsx",
    props: [
      {
        name: "metrics",
        type: "RetOpsMetrics | null",
        required: true,
        description: "Metrics with latency percentiles (P50, P75, P90, P95, P99)",
      },
      {
        name: "timeSeries",
        type: "TimeSeriesData | null",
        required: true,
        description: "Time series data for latency trend",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
    ],
  },
  {
    id: "quality-trend",
    name: "QualityTrend",
    category: "retops",
    path: "src/components/retops/QualityTrend.tsx",
    props: [
      {
        name: "quality",
        type: "QualityMetrics | null",
        required: true,
        description: "Quality metrics (MRR, nDCG, groundedness, precision/recall at K)",
      },
      {
        name: "trend",
        type: "QualityTrendPoint[]",
        required: true,
        description: "Historical quality data for trend chart",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
    ],
  },
  {
    id: "top-queries",
    name: "TopQueries",
    category: "retops",
    path: "src/components/retops/TopQueries.tsx",
    props: [
      {
        name: "queries",
        type: "TopQuery[]",
        required: true,
        description: "List of top queries with stats",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
    ],
  },
  {
    id: "alerts-panel",
    name: "AlertsPanel",
    category: "retops",
    path: "src/components/retops/AlertsPanel.tsx",
    props: [
      {
        name: "alerts",
        type: "RetOpsAlert[]",
        required: true,
        description: "List of alerts with severity and status",
      },
      {
        name: "loading",
        type: "boolean",
        required: false,
        default: "false",
        description: "Show loading skeleton",
      },
      {
        name: "onAcknowledge",
        type: "(alertId: string) => void",
        required: false,
        description: "Callback when alert is acknowledged",
      },
    ],
  },
];

// ============================================
// Code Examples
// ============================================

const codeExamples: Record<string, string> = {
  "graph-canvas": `import { GraphCanvas } from "@/components/graph/GraphCanvas";

const graphData = {
  nodes: [
    { id: "1", label: "Admin", type: "user", status: "active", permissions: [] },
    { id: "2", label: "Documents", type: "collection", status: "active", permissions: [] },
  ],
  edges: [
    { id: "e1", source: "1", target: "2", type: "has_access", direction: "directed" },
  ],
  metadata: { type: "permission", stats: { nodeCount: 2, edgeCount: 1 } },
};

export function PermissionGraph() {
  return (
    <div className="h-[600px]">
      <GraphCanvas
        data={graphData}
        onNodeSelect={(nodeId) => console.log("Selected:", nodeId)}
        layout="dagre"
        showMinimap
        showControls
      />
    </div>
  );
}`,
  "node-renderer": `// NodeRenderer is used internally by GraphCanvas
// Custom node data structure:
interface GraphNodeData {
  label: string;
  description?: string;
  type: "user" | "role" | "group" | "collection" | "document" | "chunk" | "source" | "policy" | "organization" | "service" | "custom";
  status: "active" | "inactive" | "pending" | "error" | "syncing";
  permissions: Permission[];
  metadata: Record<string, unknown>;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    size?: "small" | "medium" | "large";
  };
}`,
  "explain-panel": `import { ExplainPanel } from "@/components/explain/ExplainPanel";

const explanation = {
  resultId: "doc-123",
  overallScore: 0.87,
  scoreBreakdown: {
    vectorScore: 0.92,
    keywordScore: 0.78,
    rerankScore: 0.89,
    recencyBoost: 0.05,
  },
  attributions: [
    { sourceId: "src-1", contribution: 0.65, matchedTerms: [...] },
  ],
};

export function SearchResult() {
  return (
    <ExplainPanel
      explanation={explanation}
      isExpanded={true}
      onToggle={() => {}}
    />
  );
}`,
  "score-breakdown": `import { ScoreBreakdown } from "@/components/explain/ScoreBreakdown";

const breakdown = {
  vectorScore: 0.92,
  keywordScore: 0.78,
  rerankScore: 0.89,
  recencyBoost: 0.05,
  finalScore: 0.87,
};

export function ScoreVisualization() {
  return <ScoreBreakdown breakdown={breakdown} showDetails />;
}`,
  "attribution-list": `import { AttributionList } from "@/components/explain/AttributionList";

const attributions = [
  {
    sourceId: "doc-1",
    sourceName: "Technical Overview",
    contribution: 0.65,
    matchedTerms: [
      { term: "vector search", matchType: "exact", contribution: 0.3 },
      { term: "semantic", matchType: "semantic", contribution: 0.35 },
    ],
  },
];

export function SourceAttribution() {
  return (
    <AttributionList
      attributions={attributions}
      onAttributionClick={(id) => console.log("View source:", id)}
    />
  );
}`,
  "highlighted-passage": `import { HighlightedPassage } from "@/components/explain/HighlightedPassage";

const passage = "Vector search enables semantic understanding of queries...";
const visualization = {
  highlights: [
    { start: 0, end: 13, type: "exact_match", importance: 0.9 },
    { start: 22, end: 30, type: "semantic_match", importance: 0.7 },
  ],
  matchSummary: { exactMatches: 1, semanticMatches: 1, totalCoverage: 35 },
};

export function MatchedContent() {
  return <HighlightedPassage content={passage} visualization={visualization} />;
}`,
  "retops-dashboard": `import { RetOpsDashboard } from "@/components/retops/RetOpsDashboard";

export function MonitoringPage() {
  return (
    <RetOpsDashboard
      collectionId="my-collection"
      refreshInterval={30}
      className="p-6"
    />
  );
}`,
  "metrics-overview": `import { MetricsOverview } from "@/components/retops/MetricsOverview";

const metrics = {
  qps: 125.5,
  totalQueries: 450000,
  latency: { p50: 45, p75: 82, p90: 120, p95: 180, p99: 350, max: 850, avg: 65 },
  cache: { hitRate: 0.78, hits: 351000, misses: 99000 },
  errors: { rate: 0.002, total: 900 },
  quality: { mrr: 0.85, ndcg: 0.82, groundedness: 0.91 },
};

export function DashboardHeader() {
  return <MetricsOverview metrics={metrics} loading={false} />;
}`,
  "query-volume-chart": `import { QueryVolumeChart } from "@/components/retops/QueryVolumeChart";

const stats = {
  queryVolume: { peakQps: 200, avgQps: 125 },
  searchTypes: { hybrid: 280000, vector: 120000, keyword: 40000, federated: 10000 },
};

const timeSeries = {
  timestamps: ["2024-01-01T00:00", "2024-01-01T01:00", ...],
  qps: [120, 135, 150, ...],
  errorRate: [0.001, 0.002, 0.001, ...],
};

export function VolumeChart() {
  return <QueryVolumeChart stats={stats} timeSeries={timeSeries} />;
}`,
  "latency-distribution": `import { LatencyDistribution } from "@/components/retops/LatencyDistribution";

const metrics = {
  latency: { p50: 45, p75: 82, p90: 120, p95: 180, p99: 350, max: 850, avg: 65 },
};

const timeSeries = {
  timestamps: [...],
  latencyP50: [42, 45, 48, ...],
  latencyP99: [320, 350, 380, ...],
};

export function LatencyChart() {
  return <LatencyDistribution metrics={metrics} timeSeries={timeSeries} />;
}`,
  "quality-trend": `import { QualityTrend } from "@/components/retops/QualityTrend";

const quality = {
  mrr: 0.85,
  ndcg: 0.82,
  groundedness: 0.91,
  precisionAtK: { p1: 0.92, p3: 0.88, p5: 0.85, p10: 0.80 },
  recallAtK: { r1: 0.35, r3: 0.62, r5: 0.78, r10: 0.91 },
  rerankImprovement: 0.12,
};

const trend = [
  { timestamp: "2024-01-01", mrr: 0.82, ndcg: 0.79, groundedness: 0.88 },
  { timestamp: "2024-01-02", mrr: 0.84, ndcg: 0.81, groundedness: 0.90 },
];

export function QualityMetrics() {
  return <QualityTrend quality={quality} trend={trend} />;
}`,
  "top-queries": `import { TopQueries } from "@/components/retops/TopQueries";

const queries = [
  {
    queryHash: "abc123",
    queryPreview: "how to implement vector search",
    count: 1250,
    avgLatencyMs: 85,
    cacheHitRate: 0.82,
    avgResultCount: 8,
    lastExecuted: "2024-01-15T10:30:00Z",
  },
];

export function PopularQueries() {
  return <TopQueries queries={queries} />;
}`,
  "alerts-panel": `import { AlertsPanel } from "@/components/retops/AlertsPanel";

const alerts = [
  {
    id: "alert-1",
    title: "High P99 Latency",
    message: "P99 latency exceeded 500ms threshold",
    severity: "warning",
    status: "active",
    metric: "latency_p99",
    currentValue: 650,
    threshold: 500,
    createdAt: "2024-01-15T10:00:00Z",
  },
];

export function AlertsDashboard() {
  return (
    <AlertsPanel
      alerts={alerts}
      onAcknowledge={(id) => console.log("Acknowledged:", id)}
    />
  );
}`,
};

// ============================================
// Category Config
// ============================================

const categories = [
  { id: "graph", label: "Graph", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
  { id: "explain", label: "Explain", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
  { id: "retops", label: "RetOps", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
];

// ============================================
// Components
// ============================================

function CategoryIcon({ path }: { path: string }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function PropTable({ props }: { props: PropDoc[] }) {
  const t = useTranslations("docs.componentsPage");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-szn-border">
            <th className="text-left py-3 px-4 font-semibold text-szn-text-1">{t("propName")}</th>
            <th className="text-left py-3 px-4 font-semibold text-szn-text-1">{t("propType")}</th>
            <th className="text-left py-3 px-4 font-semibold text-szn-text-1">{t("propDefault")}</th>
            <th className="text-left py-3 px-4 font-semibold text-szn-text-1">{t("propDescription")}</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-b border-szn-border">
              <td className="py-3 px-4">
                <code className="text-indigo-600 dark:text-indigo-400 font-mono text-xs">
                  {prop.name}
                  {prop.required && <span className="text-red-500 ml-1">*</span>}
                </code>
              </td>
              <td className="py-3 px-4">
                <code className="text-szn-text-2 font-mono text-xs bg-szn-surface px-2 py-0.5 rounded">
                  {prop.type}
                </code>
              </td>
              <td className="py-3 px-4 text-szn-text-2 text-xs">
                {prop.default || "-"}
              </td>
              <td className="py-3 px-4 text-szn-text-2 text-xs">
                {prop.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ code, language = "tsx" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("docs.componentsPage");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 px-2 py-1 text-xs font-medium text-szn-text-2 bg-szn-surface rounded hover:bg-szn-surface-1 transition-colors"
      >
        {copied ? t("copied") : t("copy")}
      </button>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

function ComponentCard({ doc }: { doc: ComponentDoc }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations("docs.componentsPage");

  return (
    <div
      id={doc.id}
      className="bg-szn-card border border-szn-border rounded-xl overflow-hidden scroll-mt-24"
    >
      {/* Header */}
      <div
        className="p-6 cursor-pointer hover:bg-szn-surface-1 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-szn-text-1">
              {doc.name}
            </h3>
            <p className="text-sm text-szn-text-2 mt-1 font-mono">
              {doc.path}
            </p>
          </div>
          <svg
            className={`w-6 h-6 text-szn-text-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-szn-border">
          {/* Props */}
          <div className="p-6">
            <h4 className="text-lg font-semibold text-szn-text-1 mb-4">
              {t("props")}
            </h4>
            <PropTable props={doc.props} />
          </div>

          {/* Usage Example */}
          {codeExamples[doc.id] && (
            <div className="p-6 border-t border-szn-border bg-szn-surface">
              <h4 className="text-lg font-semibold text-szn-text-1 mb-4">
                {t("usage")}
              </h4>
              <CodeBlock code={codeExamples[doc.id]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function ComponentsPage() {
  const t = useTranslations("docs.componentsPage");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredDocs = activeCategory
    ? componentDocs.filter((doc) => doc.category === activeCategory)
    : componentDocs;

  return (
    <div className="min-h-screen bg-szn-bg">
      {/* Header */}
      <div className="bg-szn-card border-b border-szn-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <nav className="text-sm text-szn-text-2 mb-4">
            <Link href="/docs" className="hover:text-szn-text-1">
              Docs
            </Link>
            <span className="mx-2">/</span>
            <span className="text-szn-text-1">{t("title")}</span>
          </nav>
          <h1 className="text-4xl font-bold text-szn-text-1">
            {t("title")}
          </h1>
          <p className="text-lg text-szn-text-2 mt-4 max-w-3xl">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === null
                ? "bg-indigo-600 text-white"
                : "bg-szn-card text-szn-text-1 border border-szn-border hover:bg-szn-surface-1"
            }`}
          >
            {t("all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeCategory === cat.id
                  ? "bg-indigo-600 text-white"
                  : "bg-szn-card text-szn-text-1 border border-szn-border hover:bg-szn-surface-1"
              }`}
            >
              <CategoryIcon path={cat.icon} />
              {cat.label}
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-szn-surface text-szn-text-2">
                {componentDocs.filter((d) => d.category === cat.id).length}
              </span>
            </button>
          ))}
        </div>

        {/* Component Sections */}
        {categories
          .filter((cat) => !activeCategory || cat.id === activeCategory)
          .map((category) => {
            const categoryDocs = filteredDocs.filter((doc) => doc.category === category.id);
            if (categoryDocs.length === 0) return null;

            return (
              <section key={category.id} className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                    <CategoryIcon path={category.icon} />
                  </div>
                  <h2 className="text-2xl font-bold text-szn-text-1">
                    {category.label} {t("components")}
                  </h2>
                </div>

                <div className="space-y-4">
                  {categoryDocs.map((doc) => (
                    <ComponentCard key={doc.id} doc={doc} />
                  ))}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
