// Tunables for the Author Coach feature.
//
// Single source of truth for the numbers that the audit team flagged as
// "magic numbers spread across files." When tuning behavior, change it here
// rather than in `analyze.ts` or `coach-view.tsx`.

/** Maximum character count the textarea accepts before truncation. */
export const COACH_MAX_INPUT_CHARS = 30_000;

/** Wall-clock ceiling for the LLM call. Mirrors COACH_LLM_TIMEOUT_MS in analyze.ts. */
export const COACH_LLM_TIMEOUT_MS = 20_000;

/** maxTokens passed to the LLM client. */
export const COACH_LLM_MAX_TOKENS = 2400;

/** temperature passed to the LLM client. */
export const COACH_LLM_TEMPERATURE = 0.2;

/** Debounce window before the local anti-cliche scan re-runs while typing. */
export const COACH_CLICHE_SCAN_DEBOUNCE_MS = 300;

/** Hard cap on cliche findings rendered in the sidebar (older overflow into "+ N more"). */
export const COACH_CLICHE_PANEL_LIMIT = 12;
