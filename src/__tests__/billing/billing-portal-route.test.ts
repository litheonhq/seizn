import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/api/request-user";
import { POST } from "@/app/api/account/billing-portal/route";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";

const mocks = vi.hoisted(() => ({
  profile: { stripe_customer_id: "cus_author_123" } as { stripe_customer_id?: string | null } | null,
  filters: [] as Array<[string, string]>,
  portalCreate: vi.fn(async () => ({ url: "https://billing.stripe.test/session" })),
}));

vi.mock("@/lib/api/request-user", () => ({
  getRequestUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          mocks.filters.push([column, value]);
          return {
            single: async () => ({ data: mocks.profile, error: mocks.profile ? null : { message: "missing" } }),
          };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    billingPortal: {
      sessions: {
        create: mocks.portalCreate,
      },
    },
  }),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTHOR_UI_ENABLED: process.env.AUTHOR_UI_ENABLED,
  AUTHOR_UI_ALLOWED_USER_IDS: process.env.AUTHOR_UI_ALLOWED_USER_IDS,
  AUTHOR_UI_ALLOWED_EMAILS: process.env.AUTHOR_UI_ALLOWED_EMAILS,
};

describe("account billing portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = { stripe_customer_id: "cus_author_123" };
    mocks.filters = [];
    process.env.NODE_ENV = "test";
    delete process.env.AUTHOR_UI_ENABLED;
    delete process.env.AUTHOR_UI_ALLOWED_USER_IDS;
    delete process.env.AUTHOR_UI_ALLOWED_EMAILS;
    vi.mocked(getRequestUser).mockResolvedValue({
      id: "profile-user-1",
      email: "author@example.com",
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });
  });

  afterEach(() => {
    restoreEnv("NODE_ENV", ORIGINAL_ENV.NODE_ENV);
    restoreEnv("AUTHOR_UI_ENABLED", ORIGINAL_ENV.AUTHOR_UI_ENABLED);
    restoreEnv("AUTHOR_UI_ALLOWED_USER_IDS", ORIGINAL_ENV.AUTHOR_UI_ALLOWED_USER_IDS);
    restoreEnv("AUTHOR_UI_ALLOWED_EMAILS", ORIGINAL_ENV.AUTHOR_UI_ALLOWED_EMAILS);
  });

  it("creates a Stripe billing portal session for the normalized Author UI user", async () => {
    const response = await POST(portalRequest({ return_to: "/dashboard/author/settings" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://billing.stripe.test/session" });
    expect(mocks.filters).toContainEqual(["id", "profile-user-1"]);
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: "cus_author_123",
      return_url: "https://example.com/dashboard/author/settings",
    });
  });

  it("returns 404 when no billing customer exists", async () => {
    mocks.profile = { stripe_customer_id: null };

    const response = await POST(portalRequest({ return_to: "/dashboard/author/settings" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No billing account found" });
  });

  it("applies the Author UI CSRF guard to portal creation", async () => {
    const response = await POST(new NextRequest("https://example.com/api/account/billing-portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ return_to: "/dashboard/author/settings" }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "CSRF validation failed: token mismatch",
    });
  });
});

function portalRequest(body: Record<string, unknown>): NextRequest {
  const token = "csrf-token";
  return new NextRequest("https://example.com/api/account/billing-portal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      [CSRF_HEADER_NAME]: token,
    },
    body: JSON.stringify(body),
  });
}

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
