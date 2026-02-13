export type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/**
 * Convert arbitrary errors (including API error objects) into a safe display string.
 * Prevents React runtime errors like:
 * "Objects are not valid as a React child ..."
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;

  if (isRecord(error)) {
    // Common shapes: { message }, { error: { message } }, { error_code, message, hint, trace_id }
    const message = error["message"];
    if (typeof message === "string" && message.trim()) return message;

    const nestedError = error["error"];
    if (isRecord(nestedError)) {
      const nestedMessage = nestedError["message"];
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
    }

    const code = error["error_code"];
    const hint = error["hint"];
    if (typeof code === "string" && typeof hint === "string" && hint.trim()) {
      return `${code}: ${hint}`;
    }
    if (typeof code === "string" && code.trim()) return code;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

