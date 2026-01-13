"use client";

import type { TranslationModel, TrainingMetrics } from "@/lib/ecl/types";

// ============================================
// Types
// ============================================

export interface ModelQualityCardProps {
  model: TranslationModel;
  metrics?: TrainingMetrics;
  compact?: boolean;
  showRecommendations?: boolean;
}

// ============================================
// Quality Rating
// ============================================

interface QualityRating {
  level: "excellent" | "good" | "fair" | "poor";
  label: string;
  color: string;
  bgColor: string;
}

function getQualityRating(rmse: number, cosine?: number): QualityRating {
  // Quality thresholds (these can be tuned based on empirical results)
  // Lower RMSE is better, higher cosine similarity is better

  if (rmse < 0.05 && (cosine === undefined || cosine > 0.95)) {
    return {
      level: "excellent",
      label: "Excellent",
      color: "text-green-700",
      bgColor: "bg-green-100",
    };
  }
  if (rmse < 0.1 && (cosine === undefined || cosine > 0.9)) {
    return {
      level: "good",
      label: "Good",
      color: "text-blue-700",
      bgColor: "bg-blue-100",
    };
  }
  if (rmse < 0.2 && (cosine === undefined || cosine > 0.8)) {
    return {
      level: "fair",
      label: "Fair",
      color: "text-yellow-700",
      bgColor: "bg-yellow-100",
    };
  }
  return {
    level: "poor",
    label: "Poor",
    color: "text-red-700",
    bgColor: "bg-red-100",
  };
}

// ============================================
// Icons
// ============================================

function CheckCircleIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ExclamationIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ============================================
// Metric Row
// ============================================

interface MetricRowProps {
  label: string;
  value: string | number;
  unit?: string;
  quality?: "good" | "neutral" | "bad";
  tooltip?: string;
}

function MetricRow({ label, value, unit, quality, tooltip }: MetricRowProps) {
  const valueColors = {
    good: "text-green-600",
    neutral: "text-gray-900",
    bad: "text-red-600",
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-600">{label}</span>
        {tooltip && (
          <div className="relative group">
            <InfoIcon />
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-10">
              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                {tooltip}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span
          className={`text-sm font-medium ${valueColors[quality || "neutral"]}`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

// ============================================
// Recommendation Item
// ============================================

interface RecommendationProps {
  type: "improvement" | "warning" | "info";
  message: string;
}

function Recommendation({ type, message }: RecommendationProps) {
  const styles = {
    improvement: {
      bg: "bg-green-50",
      border: "border-green-200",
      icon: <ArrowUpIcon />,
      iconColor: "text-green-500",
    },
    warning: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      icon: <ExclamationIcon />,
      iconColor: "text-yellow-500",
    },
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: <InfoIcon />,
      iconColor: "text-blue-500",
    },
  };

  const style = styles[type];

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded border ${style.bg} ${style.border}`}
    >
      <div className={style.iconColor}>{style.icon}</div>
      <p className="text-xs text-gray-700">{message}</p>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ModelQualityCard({
  model,
  metrics,
  compact = false,
  showRecommendations = true,
}: ModelQualityCardProps) {
  // Use model metrics if available, fall back to passed metrics
  const rmse = metrics?.rmse ?? model.validationRmse;
  const cosine = metrics?.cosineSimilarityMean ?? model.cosineSimilarityMean;
  const r2 = metrics?.r2 ?? model.validationR2;
  const trainingSamples = model.trainingSamples;

  // Check if model is ready
  if (model.status !== "ready" || rmse === undefined) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500 text-center">
          {model.status === "training"
            ? "Training in progress..."
            : model.status === "failed"
              ? "Training failed"
              : "Model not trained yet"}
        </p>
      </div>
    );
  }

  const quality = getQualityRating(rmse, cosine);

  // Generate recommendations
  const recommendations: RecommendationProps[] = [];

  if (showRecommendations) {
    if (trainingSamples < 100) {
      recommendations.push({
        type: "improvement",
        message: "Adding more training pairs (100+) may improve translation quality.",
      });
    }

    if (rmse > 0.15) {
      recommendations.push({
        type: "warning",
        message:
          "High RMSE suggests significant translation error. Consider more diverse training data.",
      });
    }

    if (cosine !== undefined && cosine < 0.85) {
      recommendations.push({
        type: "warning",
        message:
          "Low cosine similarity may affect retrieval accuracy. Verify training data quality.",
      });
    }

    if (quality.level === "excellent") {
      recommendations.push({
        type: "info",
        message:
          "Translation quality is excellent. This model is ready for production use.",
      });
    }
  }

  if (compact) {
    return (
      <div className="p-3 rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={quality.color}>
              <CheckCircleIcon />
            </div>
            <span className={`text-sm font-medium ${quality.color}`}>
              {quality.label}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">RMSE</p>
            <p className="text-sm font-medium text-gray-900">{rmse.toFixed(4)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header with quality badge */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Model Quality</h3>
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${quality.bgColor} ${quality.color}`}
          >
            <CheckCircleIcon />
            {quality.label}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-4 py-2 divide-y divide-gray-100">
        <MetricRow
          label="RMSE"
          value={rmse.toFixed(4)}
          quality={rmse < 0.1 ? "good" : rmse > 0.2 ? "bad" : "neutral"}
          tooltip="Root Mean Squared Error - lower is better"
        />

        {cosine !== undefined && (
          <MetricRow
            label="Cosine Similarity"
            value={(cosine * 100).toFixed(1)}
            unit="%"
            quality={cosine > 0.9 ? "good" : cosine < 0.8 ? "bad" : "neutral"}
            tooltip="Average cosine similarity between translated and actual vectors"
          />
        )}

        {r2 !== undefined && (
          <MetricRow
            label="R-squared"
            value={r2.toFixed(3)}
            quality={r2 > 0.9 ? "good" : r2 < 0.7 ? "bad" : "neutral"}
            tooltip="Coefficient of determination - higher is better"
          />
        )}

        <MetricRow
          label="Training Samples"
          value={trainingSamples.toLocaleString()}
          quality={
            trainingSamples >= 100
              ? "good"
              : trainingSamples < 50
                ? "bad"
                : "neutral"
          }
          tooltip="Number of text pairs used for training"
        />

        {model.trainedAt && (
          <MetricRow
            label="Trained"
            value={new Date(model.trainedAt).toLocaleDateString()}
            tooltip="When the model was last trained"
          />
        )}
      </div>

      {/* Recommendations */}
      {showRecommendations && recommendations.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-2">
            Recommendations
          </p>
          <div className="space-y-2">
            {recommendations.map((rec, idx) => (
              <Recommendation key={idx} type={rec.type} message={rec.message} />
            ))}
          </div>
        </div>
      )}

      {/* Translation Type Info */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Translation Type</span>
          <span className="font-medium text-gray-700 capitalize">
            {model.translationType}
            {model.translationType === "linear"
              ? " (matrix only)"
              : model.translationType === "affine"
                ? " (matrix + bias)"
                : ""}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-gray-500">Dimensions</span>
          <span className="font-medium text-gray-700">
            {model.sourceDim}d to {model.targetDim}d
          </span>
        </div>
      </div>
    </div>
  );
}

export default ModelQualityCard;
