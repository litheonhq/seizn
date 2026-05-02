import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthorSettingsClient } from "@/components/settings/author-settings-client";
import { getAuthorSettingsCopy, authorSettingsI18nLocales } from "@/components/settings/author-settings-i18n";
import { ByokSection } from "@/components/settings/byok-section";
import { UsageSection } from "@/components/settings/usage-section";
import type { ByokDiscountStatus, ByokState, SubscriptionState, UsageState } from "@/components/settings/author-settings-types";

vi.mock("@/contexts/DashboardLocaleContext", () => ({
  useDashboardTranslation: () => ({
    locale: "en",
    dictionary: {},
    isLoading: false,
    t: (key: string) => key,
  }),
}));

const activeByok: ByokState = {
  enabled: true,
  provider: "anthropic",
  key_last_4: "7890",
  verified_at: "2026-05-03T00:00:00.000Z",
  status: "active",
};

const missingByok: ByokState = {
  enabled: false,
  provider: null,
  key_last_4: null,
  verified_at: null,
  status: "missing",
};

const subscription: SubscriptionState = {
  plan: "pro",
  tier: "pro",
  tier_label: "Pro",
  status: "active",
  current_period_end: "2026-06-03T00:00:00.000Z",
  renews_at: "2026-06-03T00:00:00.000Z",
  trial_ends_at: null,
  trial_days_remaining: null,
  cancel_at_period_end: false,
  payment_failed: false,
  byok_active: true,
  byok_discount_active: true,
  byok_discount_status: "applied",
  byok_discount_error: null,
  price_lock_version: "v7",
  usage: {
    tokens_used_month: 1_250_000,
    tokens_cap_month: null,
    request_count: 7,
    byok_active: true,
  },
};

const usage: UsageState = {
  tokens_used_month: 1_250_000,
  tokens_cap_month: null,
  overage_tokens: 0,
  overage_charges_usd: 0,
  byok_active: true,
  tier: "pro",
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  document.cookie = "seizn_csrf_token=; Max-Age=0; path=/";
});

describe("Author settings UI", () => {
  it("renders all four settings sections after loading", async () => {
    installFetchMocks();

    await render(<AuthorSettingsClient />);

    expect(await findText("API Keys")).toBeTruthy();
    expect(getText("Subscription & Billing")).toBeTruthy();
    expect(getText("Usage")).toBeTruthy();
    expect(getText("Sync")).toBeTruthy();
  });

  it("shows the active BYOK key and applied discount without exposing the raw key", async () => {
    installFetchMocks();

    await render(<AuthorSettingsClient />);

    expect(await findText("•••• 7890")).toBeTruthy();
    expect(getText("Applied")).toBeTruthy();
    expect(queryText("sk-ant-test-secret")).toBeNull();
  });

  it.each<ByokDiscountStatus>(["applied", "pending", "error", "inactive"])(
    "renders BYOK discount state %s",
    async (status) => {
      await renderByokStatus(status);

      expect(getText(getAuthorSettingsCopy("en").byok.discountStates[status])).toBeTruthy();
    }
  );

  it("saves an Anthropic BYOK key with the provider hard-coded", async () => {
    document.cookie = "seizn_csrf_token=csrf-123; path=/";
    const requests = installFetchMocks();
    await render(<AuthorSettingsClient />);

    const input = await findInputByLabel("Anthropic API key");
    await changeInput(input, "sk-ant-test-secret");
    await click(getButton("Save key"));

    await waitForCondition(() => {
      expect(requests.some((request) =>
        request.url === "/api/account/byok" &&
        request.method === "POST" &&
        request.body === JSON.stringify({ provider: "anthropic", api_key: "sk-ant-test-secret" }) &&
        request.csrf === "csrf-123"
      )).toBe(true);
    });
  });

  it("removes BYOK through DELETE and refreshes account state", async () => {
    const requests = installFetchMocks();
    await render(<AuthorSettingsClient />);

    await click(await findButton("Remove key"));

    await waitForCondition(() => {
      expect(requests.some((request) =>
        request.url === "/api/account/byok" && request.method === "DELETE"
      )).toBe(true);
    });
  });

  it("opens the billing portal from the settings page", async () => {
    const requests = installFetchMocks();
    const navigate = vi.fn();
    await render(<AuthorSettingsClient navigateToBilling={navigate} />);

    await click(await findButton("Manage Billing"));

    await waitForCondition(() => {
      expect(requests.some((request) =>
        request.url === "/api/account/billing-portal" && request.method === "POST"
      )).toBe(true);
      expect(navigate).toHaveBeenCalledWith("https://billing.stripe.test/session");
    });
  });

  it("shows Unlimited (BYOK) when usage has no managed token cap", async () => {
    await render(
      <UsageSection
        usage={usage}
        requestCount={7}
        copy={getAuthorSettingsCopy("en").usage}
      />
    );

    expect(getText("Unlimited (BYOK)")).toBeTruthy();
    expect(getText("7")).toBeTruthy();
  });

  it("ships settings copy for the required launch locales", () => {
    for (const locale of authorSettingsI18nLocales) {
      const copy = getAuthorSettingsCopy(locale);
      expect(copy.byok.title).toBeTruthy();
      expect(copy.subscription.manage).toBeTruthy();
      expect(copy.usage.unlimitedByok).toContain("BYOK");
      expect(copy.sync.comingSoon).toBeTruthy();
    }
  });
});

async function renderByokStatus(status: ByokDiscountStatus): Promise<void> {
  await render(
    <ByokSection
      byok={status === "inactive" ? missingByok : activeByok}
      discountStatus={status}
      discountError={status === "error" ? "stripe_not_configured" : null}
      copy={getAuthorSettingsCopy("en").byok}
      action="idle"
      onSave={async () => ({ status })}
      onRemove={async () => ({ status: "inactive" })}
    />
  );
}

async function render(ui: ReactNode): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(ui);
  });
}

function getText(text: string): Element {
  const match = queryText(text);
  if (!match) throw new Error(`Missing text: ${text}`);
  return match;
}

function queryText(text: string): Element | null {
  const elements = Array.from((container ?? document.body).querySelectorAll("*"));
  return elements.find((element) => element.textContent === text) ?? null;
}

async function findText(text: string): Promise<Element> {
  await waitForCondition(() => {
    expect(queryText(text)).not.toBeNull();
  });
  return getText(text);
}

function getButton(name: string): HTMLButtonElement {
  const button = queryButton(name);
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function queryButton(name: string): HTMLButtonElement | null {
  const buttons = Array.from((container ?? document.body).querySelectorAll("button"));
  return buttons.find((button) => button.textContent?.trim() === name) ?? null;
}

async function findButton(name: string): Promise<HTMLButtonElement> {
  await waitForCondition(() => {
    expect(queryButton(name)).not.toBeNull();
  });
  return getButton(name);
}

async function findInputByLabel(labelText: string): Promise<HTMLInputElement> {
  await findText(labelText);
  const label = queryText(labelText) as HTMLLabelElement | null;
  const id = label?.getAttribute("for");
  const input = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
  if (!input) throw new Error(`Missing input for label: ${labelText}`);
  return input;
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function waitForCondition(assertion: () => void, timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
  }
  throw lastError;
}

function beforeReactAct(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

function installFetchMocks() {
  const requests: Array<{ url: string; method: string; body?: BodyInit | null; csrf?: string | null }> = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      body: init?.body ?? null,
      csrf: init?.headers && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)["x-csrf-token"] ?? null
        : null,
    });

    if (url === "/api/account/byok" && method === "POST") {
      return jsonResponse({
        ...activeByok,
        byok_discount: { status: "applied", applied: true },
      });
    }
    if (url === "/api/account/byok" && method === "DELETE") {
      return jsonResponse({
        ...missingByok,
        byok_discount: { status: "inactive", removed: true },
      });
    }
    if (url === "/api/account/billing-portal" && method === "POST") {
      return jsonResponse({ url: "https://billing.stripe.test/session" });
    }
    if (url === "/api/account/byok") return jsonResponse(activeByok);
    if (url === "/api/account/subscription") return jsonResponse(subscription);
    if (url === "/api/account/usage") return jsonResponse(usage);
    return jsonResponse({ error: "not_found" }, 404);
  }) as typeof fetch;
  return requests;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
