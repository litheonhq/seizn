"use client";

import { useState } from "react";

export interface TraceStep {
  name: string;
  stage: "embed" | "search" | "rerank" | "generate" | "validate";
  startMs: number;
  endMs: number;
  model?: string;
  inputSize?: number;
  outputSize?: number;
  cached?: boolean;
  cost?: number;
  details?: Record<string, unknown>;
}

export interface TraceSummary {
  totalLatencyMs: number;
  totalCost: number;
  tokensUsed: number;
  vectorOps: number;
  steps: TraceStep[];
}

interface TracePanelProps {
  trace: TraceSummary | null;
  isLoading: boolean;
}

const STAGE_COLORS: Record<TraceStep["stage"], { bg: string; text: string; border: string }> = {
  embed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  search: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  rerank: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  generate: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  validate: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

export function TracePanel({ trace, isLoading }: TracePanelProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <svg className="animate-spin w-8 h-8 mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm">Tracing pipeline...</p>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">Run a query to see the trace</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">Latency</div>
            <div className="text-lg font-semibold text-gray-900">
              {trace.totalLatencyMs.toFixed(0)}ms
            </div>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <div className="text-xs text-gray-500 mb-1">Cost</div>
            <div className="text-lg font-semibold text-gray-900">
              ${trace.totalCost.toFixed(4)}
            </div>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <div className="text-xs text-gray-500 mb-1">Tokens</div>
            <div className="text-lg font-semibold text-gray-900">
              {trace.tokensUsed.toLocaleString()}
            </div>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <div className="text-xs text-gray-500 mb-1">Vector Ops</div>
            <div className="text-lg font-semibold text-gray-900">
              {trace.vectorOps}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline View */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-3">
          {trace.steps.map((step, index) => {
            const colors = STAGE_COLORS[step.stage];
            const duration = step.endMs - step.startMs;
            const isExpanded = expandedStep === index;

            return (
              <div key={index} className="relative pl-10">
                {/* Timeline Dot */}
                <div className={`absolute left-2 top-4 w-4 h-4 rounded-full border-2 ${colors.border} ${colors.bg}`} />

                {/* Step Card */}
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : index)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isExpanded
                      ? `${colors.bg} ${colors.border}`
                      : "bg-white border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {step.stage}
                      </span>
                      <span className="font-medium text-gray-900 text-sm">
                        {step.name}
                      </span>
                      {step.cached && (
                        <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                          cached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 font-medium">
                        {duration.toFixed(0)}ms
                      </span>
                      {step.cost !== undefined && (
                        <span className="text-xs text-gray-400">
                          ${step.cost.toFixed(5)}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {step.model && <span>Model: {step.model}</span>}
                    {step.inputSize !== undefined && <span>Input: {step.inputSize}</span>}
                    {step.outputSize !== undefined && <span>Output: {step.outputSize}</span>}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && step.details && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto max-h-40">
                        {JSON.stringify(step.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
