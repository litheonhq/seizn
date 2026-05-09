import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthorSettingsClient } from "@/components/settings/author-settings-client";
import { getAuthorSettingsCopy, authorSettingsI18nLocales } from "@/components/settings/author-settings-i18n";
import { SubscriptionSection } from "@/components/settings/subscription-section";
import { UsageSection } from "@/components/settings/usage-section";
import type { ByokState, SubscriptionState, UsageState } from "@/components/settings/author-settings-types";

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

const ORIGINAL_PRICE_ENV = {
  STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY: process.env.STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY,
  STRIPE_PRICE_ID_V9_INDIE_MANAGED_ANNUAL_CHARTER: process.env.STRIPE_PRICE_ID_V9_INDIE_MANAGED_ANNUAL_CHARTER,
  STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY: process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY,
  STRIPE_PRICE_ID_V9_PRO_MANAGED_ANNUAL_CHARTER: process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_ANNUAL_CHARTER,
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
  restorePriceEnv();
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

  it("shows the active BYOK key without exposing the raw key", async () => {
    installFetchMocks();

    await render(<AuthorSettingsClient />);

    expect(await findText("•••• 7890")).toBeTruthy();
    expect(getText("Active")).toBeTruthy();
    expect(queryText("sk-ant-test-secret")).toBeNull();
  });

  it("saves an Anthropic BYOK key with the provider hard-coded", async () => {
    document.cookie = "seizn_csrf_token=csrf-123; path=/";
    const requests = installFetchMocks();
    await render(<AuthorSettingsClient />);

    const input = await findInputByLabel("API key (sk-ant-...)");
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
        request.url === "/api/account/byok?provider=anthropic" && request.method === "DELETE"
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

  it("shows Indie monthly pricing from the Stripe price id", async () => {
    installPriceEnv();
    await renderSubscription({
      plan: "indie",
      tier: "indie",
      tier_label: "Indie",
      stripe_price_id: "price_indie_managed_monthly_v9",
    });

    expect(renderedText()).toContain("Indie");
    expect(renderedText()).toContain("$39/mo");
    expect(queryText("Saves about 15% yearly")).toBeNull();
  });

  it("shows Indie yearly pricing and savings from the Stripe price id", async () => {
    installPriceEnv();
    await renderSubscription({
      plan: "indie",
      tier: "indie",
      tier_label: "Indie",
      stripe_price_id: "price_indie_managed_annual_charter_v9",
    });

    expect(renderedText()).toContain("Indie");
    expect(renderedText()).toContain("$324 per year");
    expect(getText("Saves about 31% yearly")).toBeTruthy();
  });

  it("shows Pro monthly pricing from the Stripe price id", async () => {
    installPriceEnv();
    await renderSubscription({
      plan: "pro",
      tier: "pro",
      tier_label: "Pro",
      stripe_price_id: "price_pro_managed_monthly_v9",
    });

    expect(renderedText()).toContain("Pro");
    expect(renderedText()).toContain("$149/mo");
  });

  it("shows Pro yearly pricing and savings from the Stripe price id", async () => {
    installPriceEnv();
    await renderSubscription({
      plan: "pro",
      tier: "pro",
      tier_label: "Pro",
      stripe_price_id: "price_pro_managed_annual_charter_v9",
    });

    expect(renderedText()).toContain("Pro");
    expect(renderedText()).toContain("$1,250 per year");
    expect(getText("Saves about 30% yearly")).toBeTruthy();
  });
});

async function renderSubscription(overrides: Partial<SubscriptionState>): Promise<void> {
  await render(
    <SubscriptionSection
      subscription={{ ...subscription, billing_cadence: null, ...overrides }}
      copy={getAuthorSettingsCopy("en").subscription}
      locale="en"
      action="idle"
      onManageBilling={async () => undefined}
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

function renderedText(): string {
  return container?.textContent?.replace(/\s+/g, " ").trim() ?? "";
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
    const headers = init?.headers instanceof Headers
      ? init.headers
      : new Headers(init?.headers);
    requests.push({
      url,
      method,
      body: init?.body ?? null,
      csrf: headers.get("x-csrf-token"),
    });

    if (url === "/api/csrf") {
      document.cookie = "seizn_csrf_token=csrf-123; path=/";
      return jsonResponse({ ok: true });
    }
    if (url === "/api/account/byok" && method === "POST") {
      return jsonResponse(activeByok);
    }
    if (url === "/api/account/byok" && method === "DELETE") {
      return jsonResponse(missingByok);
    }
    if (url === "/api/account/billing-portal" && method === "POST") {
      return jsonResponse({ url: "https://billing.stripe.test/session" });
    }
    if (url === "/api/account/llm-provider") {
      return jsonResponse({ provider: "anthropic", env_default: "anthropic" });
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

function installPriceEnv(): void {
  process.env.STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY = "price_indie_managed_monthly_v9";
  process.env.STRIPE_PRICE_ID_V9_INDIE_MANAGED_ANNUAL_CHARTER = "price_indie_managed_annual_charter_v9";
  process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY = "price_pro_managed_monthly_v9";
  process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_ANNUAL_CHARTER = "price_pro_managed_annual_charter_v9";
}

function restorePriceEnv(): void {
  for (const [name, value] of Object.entries(ORIGINAL_PRICE_ENV)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
