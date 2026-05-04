import { describe, expect, it } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://www.seizn.com/api/rum", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/rum", () => {
  it("accepts web vital attribution payloads", async () => {
    const response = await POST(
      makeRequest({
        id: "metric-1",
        name: "INP",
        value: 128,
        url: "/pricing?token=secret",
        entryType: "web-vital",
        attribution: {
          interactionTarget: "button.primary",
          longAnimationFrameCount: 1,
          longestLongAnimationFrame: {
            duration: 140,
            blockingDuration: 112,
            scripts: [{ sourceURL: "/_next/static/chunks/app.js?cache=1" }],
          },
        },
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects malformed metric payloads", async () => {
    const response = await POST(makeRequest({ name: "INP" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_payload" });
  });

  it("caps oversized RUM payloads", async () => {
    const response = await POST(makeRequest("x".repeat(17_000)) as never);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "payload_too_large" });
  });
});
