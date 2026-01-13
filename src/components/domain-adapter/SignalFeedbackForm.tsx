"use client";

import { useState } from "react";

// =============================================================================
// Types
// =============================================================================

type SignalType = "explicit_feedback" | "click" | "dwell" | "conversion";

interface SignalFeedbackFormProps {
  adapterId: string;
  defaultQuery?: string;
  onSubmit?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function SignalFeedbackForm({
  adapterId,
  defaultQuery = "",
  onSubmit,
}: SignalFeedbackFormProps) {
  const [signalType, setSignalType] = useState<SignalType>("explicit_feedback");
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Explicit feedback fields
  const [relevantDocIds, setRelevantDocIds] = useState("");
  const [irrelevantDocIds, setIrrelevantDocIds] = useState("");

  // Click fields
  const [clickedDocId, setClickedDocId] = useState("");
  const [position, setPosition] = useState(1);

  // Dwell fields
  const [dwellDocId, setDwellDocId] = useState("");
  const [dwellTime, setDwellTime] = useState(30);

  // Conversion fields
  const [convertedDocId, setConvertedDocId] = useState("");
  const [conversionType, setConversionType] = useState("purchase");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const body: Record<string, unknown> = {
        signal_type: signalType,
        query,
      };

      switch (signalType) {
        case "explicit_feedback":
          body.relevant_doc_ids = relevantDocIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          body.irrelevant_doc_ids = irrelevantDocIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          break;
        case "click":
          body.clicked_doc_id = clickedDocId;
          body.position = position;
          break;
        case "dwell":
          body.doc_id = dwellDocId;
          body.dwell_time_seconds = dwellTime;
          break;
        case "conversion":
          body.converted_doc_id = convertedDocId;
          body.conversion_type = conversionType;
          break;
      }

      const response = await fetch(`/api/adapters/${adapterId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to record signal");
      }

      setSuccess(true);
      onSubmit?.();

      // Reset form
      if (signalType === "explicit_feedback") {
        setRelevantDocIds("");
        setIrrelevantDocIds("");
      } else if (signalType === "click") {
        setClickedDocId("");
      } else if (signalType === "dwell") {
        setDwellDocId("");
      } else if (signalType === "conversion") {
        setConvertedDocId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record signal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Record Feedback Signal</h3>
        <p className="text-sm text-gray-500">
          Provide relevance feedback to improve the adapter
        </p>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
        {/* Signal Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signal Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "explicit_feedback", label: "Explicit Feedback", icon: "star" },
                { value: "click", label: "Click", icon: "cursor" },
                { value: "dwell", label: "Dwell Time", icon: "clock" },
                { value: "conversion", label: "Conversion", icon: "check" },
              ] as const
            ).map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setSignalType(type.value)}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  signalType === type.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Query */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Query
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter the search query"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Explicit Feedback Fields */}
        {signalType === "explicit_feedback" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relevant Document IDs
              </label>
              <input
                type="text"
                value={relevantDocIds}
                onChange={(e) => setRelevantDocIds(e.target.value)}
                placeholder="doc_123, doc_456 (comma-separated)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Documents that are relevant to this query
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Irrelevant Document IDs
              </label>
              <input
                type="text"
                value={irrelevantDocIds}
                onChange={(e) => setIrrelevantDocIds(e.target.value)}
                placeholder="doc_789 (comma-separated)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Documents that are NOT relevant to this query
              </p>
            </div>
          </>
        )}

        {/* Click Fields */}
        {signalType === "click" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clicked Document ID
              </label>
              <input
                type="text"
                value={clickedDocId}
                onChange={(e) => setClickedDocId(e.target.value)}
                placeholder="doc_123"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Position in Results
              </label>
              <input
                type="number"
                value={position}
                onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
                min={1}
                max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Position where the document appeared (1 = first)
              </p>
            </div>
          </>
        )}

        {/* Dwell Fields */}
        {signalType === "dwell" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document ID
              </label>
              <input
                type="text"
                value={dwellDocId}
                onChange={(e) => setDwellDocId(e.target.value)}
                placeholder="doc_123"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dwell Time (seconds)
              </label>
              <input
                type="number"
                value={dwellTime}
                onChange={(e) => setDwellTime(parseInt(e.target.value) || 30)}
                min={1}
                max={3600}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                How long the user spent viewing this document
              </p>
            </div>
          </>
        )}

        {/* Conversion Fields */}
        {signalType === "conversion" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Converted Document ID
              </label>
              <input
                type="text"
                value={convertedDocId}
                onChange={(e) => setConvertedDocId(e.target.value)}
                placeholder="doc_123"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conversion Type
              </label>
              <select
                value={conversionType}
                onChange={(e) => setConversionType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="purchase">Purchase</option>
                <option value="signup">Sign Up</option>
                <option value="download">Download</option>
                <option value="contact">Contact</option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        )}

        {/* Error / Success Messages */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
            Signal recorded successfully!
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Recording..." : "Record Signal"}
        </button>
      </form>
    </div>
  );
}

export default SignalFeedbackForm;
