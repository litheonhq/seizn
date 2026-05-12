import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PricingClient } from "@/app/[locale]/pricing/pricing-client";
import { getPricingPageCopy } from "@/app/[locale]/pricing/pricing-copy";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

describe("Pricing checkout selection", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/en/pricing");
    global.fetch = vi.fn(async () => jsonResponse({ url: "https://checkout.stripe.test/session" })) as typeof fetch;
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    window.history.replaceState(null, "", "/en/pricing");
    vi.restoreAllMocks();
  });

  it("sends the selected BYOK column from the pricing table to checkout", async () => {
    await render(<PricingClient locale="en" copy={getPricingPageCopy("en")} />);

    await click(getButton("BYOK"));
    await click(getFirstCheckbox());
    await click(getButton("Start Indie"));

    await waitForCondition(() => {
      const calls = fetchCalls();
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
        tier: "indie",
        cadence: "monthly",
        column: "byok",
      });
    });
  });

  it("switches to API/MCP pricing and sends a Track 2 checkout payload", async () => {
    await render(<PricingClient locale="en" copy={getPricingPageCopy("en")} />);

    await click(getButtonContaining("API"));

    await waitForCondition(() => {
      expect((container ?? document.body).textContent).toContain("Plug Seizn into your own AI tool.");
      expect(getButton("Choose Indie")).toBeTruthy();
      expect((container ?? document.body).textContent).toContain("$0.50 / call metered overage");
      expect((container ?? document.body).textContent).not.toContain("$0.15");
    });

    await click(getFirstCheckbox());
    await click(getButton("Choose Indie"));

    await waitForCondition(() => {
      const calls = fetchCalls();
      expect(calls).toHaveLength(1);
      const payload = JSON.parse(String(calls[0][1]?.body));
      expect(payload).toMatchObject({
        channel: "track2",
        tier: "indie",
        cadence: "monthly",
      });
      expect(payload).not.toHaveProperty("column");
    });
  });

  it("opens the API/MCP tab when pricing is loaded with the track-2 hash", async () => {
    window.history.replaceState(null, "", "/en/pricing#track-2");

    await render(<PricingClient locale="en" copy={getPricingPageCopy("en")} />);

    await waitForCondition(() => {
      expect((container ?? document.body).textContent).toContain("Plug Seizn into your own AI tool.");
      expect(getButton("Choose Pro")).toBeTruthy();
    });
  });

  it("opens the API/MCP tab when the track-2 hash arrives after client navigation", async () => {
    await render(<PricingClient locale="en" copy={getPricingPageCopy("en")} />);

    window.history.replaceState(null, "", "/en/pricing#track-2");

    await waitForCondition(() => {
      expect((container ?? document.body).textContent).toContain("Plug Seizn into your own AI tool.");
      expect(getButton("Choose Pro")).toBeTruthy();
    });
  });
});

async function render(ui: ReactNode): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(ui);
  });
}

function getButton(name: string): HTMLButtonElement {
  const button = Array.from((container ?? document.body).querySelectorAll("button"))
    .find((element) => element.textContent?.trim() === name) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function getButtonContaining(text: string): HTMLButtonElement {
  const button = Array.from((container ?? document.body).querySelectorAll("button"))
    .find((element) => element.textContent?.includes(text)) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Missing button containing: ${text}`);
  return button;
}

function getFirstCheckbox(): HTMLInputElement {
  const checkbox = (container ?? document.body).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  if (!checkbox) throw new Error("Missing checkout agreement checkbox");
  return checkbox;
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

function fetchCalls(): Array<[RequestInfo | URL, RequestInit | undefined]> {
  return (global.fetch as unknown as {
    mock: { calls: Array<[RequestInfo | URL, RequestInit | undefined]> };
  }).mock.calls;
}

function beforeReactAct(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
