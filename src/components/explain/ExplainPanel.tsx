"use client";

import { useState } from "react";
import type {
  RetrievalExplanation,
  ExplanationVisualization,
} from "@/lib/summer/explain/types";
import { ScoreBreakdownChart } from "./ScoreBreakdown";
import { AttributionList } from "./AttributionList";
import { HighlightedPassage } from "./HighlightedPassage";

// ============================================
// Types
// ============================================

interface ExplainPanelProps {
  explanation: RetrievalExplanation;
  visualization?: ExplanationVisualization;
  onClose?: () => void;
  className?: string;
}

type TabId = "score" | "attribution" | "passage" | "ranking";

interface Tab {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

// ============================================
// Icons
// ============================================

const ChartIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
    />
  </svg>
);

const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
);

const TextIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
    />
  </svg>
);

const FlowIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

// ============================================
// Tabs Configuration
// ============================================

const TABS: Tab[] = [
  { id: "score", label: "Score Breakdown", icon: ChartIcon },
  { id: "attribution", label: "Source Attribution", icon: DocumentIcon },
  { id: "passage", label: "Matched Passage", icon: TextIcon },
  { id: "ranking", label: "Ranking Flow", icon: FlowIcon },
];

// ============================================
// Component
// ============================================

export function ExplainPanel({
  explanation,
  visualization,
  onClose,
  className = "",
}: ExplainPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("score");

  const { scoreBreakdown, attribution, result, searchConfig, comparisons } =
    explanation;

  return (
    <div
      className={`bg-[var(--ink-50)] rounded-xl shadow-lg border border-[var(--ink-200)] overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--ink-200)] bg-[var(--ink-50)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ink-900)]">
              Explain Result #{result.rank}
            </h3>
            <p className="text-sm text-[var(--ink-600)] mt-1">
              Score: {(scoreBreakdown.finalScore * 100).toFixed(1)}% |{" "}
              {searchConfig.searchType} search
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-[var(--ink-50)]"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {attribution.relevanceReason}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--ink-200)]">
        <nav className="flex -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "score" && (
          <ScoreBreakdownChart
            scoreBreakdown={scoreBreakdown}
            visualization={visualization?.scoreViz}
          />
        )}

        {activeTab === "attribution" && (
          <AttributionList
            attribution={attribution}
            comparisons={comparisons}
          />
        )}

        {activeTab === "passage" && (
          <HighlightedPassage
            content={result.content}
            visualization={visualization?.passageViz}
            attribution={attribution}
          />
        )}

        {activeTab === "ranking" && (
          <RankingFlowView
            rankingFlow={visualization?.rankingFlow}
            searchConfig={searchConfig}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-[var(--ink-200)] bg-[var(--ink-50)]">
        <div className="flex items-center justify-between text-xs text-[var(--ink-600)]">
          <span>
            Document: {attribution.documentTitle || attribution.documentId}
          </span>
          <span>
            Processed in {explanation.processingInfo.latencyMs}ms
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Ranking Flow View
// ============================================

interface RankingFlowViewProps {
  rankingFlow?: Array<{
    stage: string;
    rank: number;
    score: number;
    eliminated: boolean;
  }>;
  searchConfig: {
    searchType: string;
    topK: number;
    threshold?: number;
    hybridAlpha?: number;
    rerankEnabled: boolean;
  };
}

function RankingFlowView({ rankingFlow, searchConfig }: RankingFlowViewProps) {
  if (!rankingFlow || rankingFlow.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--ink-600)]">
        No ranking flow data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Config Summary */}
      <div className="p-4 bg-[var(--ink-50)] rounded-lg">
        <h4 className="text-sm font-medium text-[var(--ink-600)] mb-2">
          Search Configuration
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-[var(--ink-600)]">Type:</span>
            <span className="ml-2 font-medium text-[var(--ink-900)] capitalize">
              {searchConfig.searchType}
            </span>
          </div>
          <div>
            <span className="text-[var(--ink-600)]">Top K:</span>
            <span className="ml-2 font-medium text-[var(--ink-900)]">
              {searchConfig.topK}
            </span>
          </div>
          {searchConfig.hybridAlpha !== undefined && (
            <div>
              <span className="text-[var(--ink-600)]">
                Hybrid Alpha:
              </span>
              <span className="ml-2 font-medium text-[var(--ink-900)]">
                {searchConfig.hybridAlpha}
              </span>
            </div>
          )}
          <div>
            <span className="text-[var(--ink-600)]">Rerank:</span>
            <span className="ml-2 font-medium text-[var(--ink-900)]">
              {searchConfig.rerankEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Flow Visualization */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--ink-50)]" />

        <div className="space-y-4">
          {rankingFlow.map((stage, index) => (
            <div key={stage.stage} className="relative pl-10">
              {/* Stage Dot */}
              <div
                className={`
                  absolute left-2 w-4 h-4 rounded-full border-2 bg-[var(--ink-50)]
                  ${
                    stage.eliminated
                      ? "border-[var(--signal-conflict)]"
                      : index === rankingFlow.length - 1
                        ? "border-[var(--signal-canon)]"
                        : "border-blue-500"
                  }
                `}
              />

              {/* Stage Card */}
              <div className="p-4 bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)]">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium text-[var(--ink-900)]">
                    {stage.stage}
                  </h5>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-[var(--ink-600)]">
                      Rank: <span className="font-medium">#{stage.rank}</span>
                    </span>
                    <span className="text-[var(--ink-600)]">
                      Score:{" "}
                      <span className="font-medium">
                        {(stage.score * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-2 h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stage.eliminated
                        ? "bg-[var(--signal-conflict)]"
                        : index === rankingFlow.length - 1
                          ? "bg-[var(--signal-canon)]"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${stage.score * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ExplainPanel;
