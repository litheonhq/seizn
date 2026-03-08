import { describe, expect, it } from "vitest";

import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";

describe("client request guard", () => {
  it("aborts the previous request when a new one begins", () => {
    const guard = createLatestRequestGuard();

    const first = guard.begin();
    expect(first.signal.aborted).toBe(false);

    const second = guard.begin();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(guard.isCurrent(first.id)).toBe(false);
    expect(guard.isCurrent(second.id)).toBe(true);
  });

  it("cancels the active request and invalidates prior ids", () => {
    const guard = createLatestRequestGuard();

    const request = guard.begin();
    guard.cancel();

    expect(request.signal.aborted).toBe(true);
    expect(guard.isCurrent(request.id)).toBe(false);
  });
});

describe("isAbortError", () => {
  it("detects abort-shaped errors", () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    expect(isAbortError(abortError)).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("other"))).toBe(false);
  });
});
