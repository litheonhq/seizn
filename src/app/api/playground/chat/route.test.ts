import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

function makeRequest(body: Record<string, unknown>, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/playground/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function isolateExternalServices() {
  process.env.ANTHROPIC_API_KEY = "";
  process.env.PLAYGROUND_DEMO_USER_ID = "";
  process.env.SEIZN_PLAYGROUND_DEMO_USER_ID = "";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
}

describe("POST /api/playground/chat", () => {
  it("honors the playground kill switch", async () => {
    isolateExternalServices();
    process.env.PLAYGROUND_ENABLED = "0";

    const response = await POST(makeRequest({ sessionId: "disabled-session", message: "hello" }, "203.0.113.10"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("playground_disabled");
  });

  it("returns live memory and a friendly 429 after ten session messages", async () => {
    isolateExternalServices();
    process.env.PLAYGROUND_ENABLED = "1";
    const sessionId = `session-${crypto.randomUUID()}`;
    const ip = "203.0.113.11";

    for (let index = 0; index < 10; index += 1) {
      const response = await POST(makeRequest({
        sessionId,
        message: `Last time Vale promised to hide brass key ${index}.`,
      }, ip));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.memory.content).toContain("Visitor scene memory");
      expect(payload.data.session.remaining).toBe(9 - index);
    }

    const limited = await POST(makeRequest({
      sessionId,
      message: "One more turn.",
    }, ip));
    const payload = await limited.json();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(payload.error.code).toBe("session_rate_limited");
    expect(payload.error.retryAfterSeconds).toBeGreaterThan(0);
  });
});
