"use client";

import { useState } from "react";
import type {
  KnowledgeGap,
  GapType,
  MissingEntity,
  SuggestedSource,
  RelatedDoc,
} from "@/lib/knowledge-gap/types";

// =============================================================================
// Types
// =============================================================================

interface GapAnalysisCardProps {
  gap: KnowledgeGap;
  onFillAction?: (gapId: string, action: SuggestedSource) => void;
  onResolve?: (gapId: string) => void;
  onDismiss?: (gapId: string) => void;
  expanded?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function GapAnalysisCard({
  gap,
  onFillAction,
  onResolve,
  onDismiss,
  expanded = false,
}: GapAnalysisCardProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [activeTab, setActiveTab] = useState<"entities" | "sources" | "related">(
    "entities"
  );

  const gapTypeInfo: Record<GapType, { label: string; description: string; icon: string }> = {
    missing_entity: {
      label: "Missing Entity",
      description: "Query mentions entities not found in your knowledge base",
      icon: "?",
    },
    missing_table: {
      label: "Missing Structured Data",
      description: "Query requests tabular or structured data that is not available",
      icon: "#",
    },
    outdated_doc: {
      label: "Outdated Content",
      description: "Query references recent information that may not be indexed",
      icon: "!",
    },
    permission_denied: {
      label: "Permission Restricted",
      description: "Relevant results exist but are restricted by permissions",
      icon: "X",
    },
    coverage_gap: {
      label: "Coverage Gap",
      description: "Topic exists but lacks sufficient depth in your knowledge base",
      icon: "~",
    },
    domain_mismatch: {
      label: "Domain Mismatch",
      description: "Query domain differs from the focus of your collection",
      icon: "!=",
    },
  };

  const info = gapTypeInfo[gap.gapType];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="p-5 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-mono text-lg font-bold">
              {info.icon}
            </span>
            <div>
              <h3 className="font-semibold text-gray-900">{info.label}</h3>
              <p className="text-sm text-gray-500">{info.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConfidenceBadge confidence={gap.confidence} />
            <ExpandIcon expanded={isExpanded} />
          </div>
        </div>

        {/* Query Preview */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-500 uppercase">Query</span>
          <p className="text-gray-800 mt-1">{gap.queryText}</p>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <TabButton
              active={activeTab === "entities"}
              onClick={() => setActiveTab("entities")}
              count={gap.missingEntities.length}
            >
              Missing Entities
            </TabButton>
            <TabButton
              active={activeTab === "sources"}
              onClick={() => setActiveTab("sources")}
              count={gap.suggestedSources.length}
            >
              Suggested Sources
            </TabButton>
            <TabButton
              active={activeTab === "related"}
              onClick={() => setActiveTab("related")}
              count={gap.relatedDocs.length}
            >
              Related Docs
            </TabButton>
          </div>

          {/* Tab Content */}
          <div className="p-5">
            {activeTab === "entities" && (
              <EntitiesTab entities={gap.missingEntities} />
            )}
            {activeTab === "sources" && (
              <SourcesTab
                sources={gap.suggestedSources}
                onAction={(source) => onFillAction?.(gap.id, source)}
              />
            )}
            {activeTab === "related" && (
              <RelatedDocsTab docs={gap.relatedDocs} />
            )}
          </div>

          {/* Actions */}
          <div className="p-5 bg-gray-50 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => onResolve?.(gap.id)}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              Mark as Resolved
            </button>
            <button
              onClick={() => onDismiss?.(gap.id)}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  let badgeClass = "szn-badge szn-badge-muted";

  if (percent >= 80) {
    badgeClass = "szn-badge szn-badge-error";
  } else if (percent >= 60) {
    badgeClass = "szn-badge szn-badge-warning";
  } else if (percent >= 40) {
    badgeClass = "szn-badge szn-badge-warning";
  }

  return (
    <span className={badgeClass}>
      {percent}% confident
    </span>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-400 transition-transform ${
        expanded ? "rotate-180" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
      {count > 0 && (
        <span
          className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
            active ? "bg-blue-100" : "bg-gray-100"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EntitiesTab({ entities }: { entities: MissingEntity[] }) {
  if (entities.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No specific missing entities detected
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entities.map((entity, i) => (
        <div
          key={i}
          className="p-4 bg-gray-50 rounded-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-900">{entity.name}</span>
            <div className="flex items-center gap-2">
              <span className="szn-badge szn-badge-info">
                {entity.type}
              </span>
              <span className="text-xs text-gray-400">
                {Math.round(entity.confidence * 100)}% confidence
              </span>
            </div>
          </div>
          {entity.context && (
            <p className="text-sm text-gray-600 italic">
              &quot;...{entity.context}...&quot;
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SourcesTab({
  sources,
  onAction,
}: {
  sources: SuggestedSource[];
  onAction: (source: SuggestedSource) => void;
}) {
  if (sources.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No source suggestions available
      </p>
    );
  }

  const priorityColors = {
    high: "border-l-red-500",
    medium: "border-l-orange-500",
    low: "border-l-gray-400",
  };

  const sourceTypeIcons: Record<string, string> = {
    web_url: "W",
    internal_doc: "D",
    api_connector: "A",
    manual_upload: "U",
    federated_source: "F",
  };

  return (
    <div className="space-y-3">
      {sources.map((source, i) => (
        <div
          key={i}
          className={`p-4 bg-white rounded-lg border-l-4 ${priorityColors[source.priority]} border border-gray-200`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-sm font-medium">
                {sourceTypeIcons[source.sourceType] || "?"}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {source.sourceType.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                  <span
                    className={`szn-badge ${
                      source.priority === "high"
                        ? "szn-badge-error"
                        : source.priority === "medium"
                        ? "szn-badge-warning"
                        : "szn-badge-muted"
                    }`}
                  >
                    {source.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{source.reason}</p>
                {source.identifier.startsWith("http") && (
                  <a
                    href={source.identifier}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-1 block truncate max-w-md"
                  >
                    {source.identifier}
                  </a>
                )}
              </div>
            </div>
            <button
              onClick={() => onAction(source)}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
            >
              Fill Gap
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RelatedDocsTab({ docs }: { docs: RelatedDoc[] }) {
  if (docs.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No related documents found
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc, i) => (
        <div
          key={i}
          className="p-4 bg-gray-50 rounded-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-900">
              {doc.title || `Document ${doc.documentId.slice(0, 8)}`}
            </span>
            <span className="text-xs text-gray-400">
              {Math.round(doc.similarity * 100)}% similar
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <span className="text-xs text-gray-500 uppercase">Covers</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {doc.presentAspects.map((aspect, j) => (
                  <span
                    key={j}
                    className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded"
                  >
                    {aspect}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase">Missing</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {doc.missingAspects.map((aspect, j) => (
                  <span
                    key={j}
                    className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded"
                  >
                    {aspect}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default GapAnalysisCard;
