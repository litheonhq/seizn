"use client";

export interface PlaygroundError {
  message: string;
  errorCode?: string;
  traceId?: string;
  hint?: string;
  timestamp?: string;
  details?: string;
}

export interface ErrorDisplayTranslations {
  error?: string;
  errorCode?: string;
  traceId?: string;
  hint?: string;
  tryAgain?: string;
  copyTraceId?: string;
  copied?: string;
}

interface ErrorDisplayProps {
  error: PlaygroundError | null;
  onRetry: () => void;
  onDismiss: () => void;
  translations?: ErrorDisplayTranslations;
}

export function ErrorDisplay({ error, onRetry, onDismiss, translations: t }: ErrorDisplayProps) {
  if (!error) return null;

  const handleCopyTraceId = async () => {
    if (error.traceId) {
      await navigator.clipboard.writeText(error.traceId);
    }
  };

  return (
    <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-[var(--signal-conflict-soft)] rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--signal-conflict-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-[var(--signal-conflict-ink)] mb-1">
              {t?.error || "Error"}
            </h4>
            <p className="text-sm text-[var(--signal-conflict-ink)] mb-3">
              {error.message}
            </p>

            {/* Error Details */}
            {(error.errorCode || error.traceId) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {error.errorCode && (
                  <div className="flex items-center gap-1.5 bg-[var(--signal-conflict-soft)] px-2 py-1 rounded">
                    <span className="text-[var(--signal-conflict-ink)] font-medium">{t?.errorCode || "Code"}:</span>
                    <code className="text-[var(--signal-conflict-ink)]">{error.errorCode}</code>
                  </div>
                )}
                {error.traceId && (
                  <div className="flex items-center gap-1.5 bg-[var(--signal-conflict-soft)] px-2 py-1 rounded">
                    <span className="text-[var(--signal-conflict-ink)] font-medium">{t?.traceId || "Trace"}:</span>
                    <code className="text-[var(--signal-conflict-ink)] font-mono">{error.traceId}</code>
                    <button
                      onClick={handleCopyTraceId}
                      className="text-[var(--signal-conflict-ink)] hover:text-[var(--signal-conflict-ink)] transition-colors"
                      title={t?.copyTraceId || "Copy trace ID"}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Hint */}
            {error.hint && (
              <div className="mt-3 text-xs text-[var(--signal-conflict-ink)] bg-[var(--signal-conflict-soft)]/50 px-3 py-2 rounded-lg">
                <span className="font-medium">{t?.hint || "Hint"}:</span> {error.hint}
              </div>
            )}
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="text-[var(--signal-conflict-soft)] hover:text-[var(--signal-conflict-ink)] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Retry Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-[var(--signal-conflict)] text-white text-sm font-medium rounded-lg hover:bg-[var(--signal-conflict)] transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t?.tryAgain || "Try Again"}
        </button>
      </div>
    </div>
  );
}
