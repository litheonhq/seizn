import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckoutButton } from "@/components/checkout-button";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

describe("CheckoutButton legal agreement", () => {
  beforeEach(() => {
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
    document.cookie = "seizn_csrf_token=; Max-Age=0; path=/";
    window.history.pushState({}, "", "/");
  });

  it("disables checkout until the legal agreement checkbox is checked", async () => {
    await render(<CheckoutButton priceId="indie">Start Indie</CheckoutButton>);

    const button = getButton("Start Indie");
    expect(button.disabled).toBe(true);

    await click(getCheckbox());
    expect(button.disabled).toBe(false);
  });

  it("renders Terms and Privacy links that open in a new tab", async () => {
    await render(
      <CheckoutButton
        priceId="pro"
        termsHref="/ko/legal/terms"
        privacyHref="/ko/legal/privacy"
      >
        Start Pro
      </CheckoutButton>
    );

    expectLink("Terms of Service", "/ko/legal/terms");
    expectLink("Privacy Policy", "/ko/legal/privacy");
  });

  it("keeps legal links outside checkbox labels", async () => {
    await render(<CheckoutButton priceId="pro">Start Pro</CheckoutButton>);

    expect(getLink("Terms of Service").closest("label")).toBeNull();
    expect(getLink("Privacy Policy").closest("label")).toBeNull();
    expect(getCheckbox().getAttribute("aria-describedby")).toBeTruthy();
  });

  it("posts to checkout only after agreement is accepted", async () => {
    document.cookie = "seizn_csrf_token=csrf-legal; path=/";
    await render(
      <CheckoutButton tier="pro" cadence="yearly">
        Start Pro
      </CheckoutButton>
    );

    await click(getButton("Start Pro"));
    expect(global.fetch).not.toHaveBeenCalled();

    await click(getCheckbox());
    await click(getButton("Start Pro"));

    await waitForCondition(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tier: "pro", cadence: "yearly" }),
        headers: expect.objectContaining({ "x-csrf-token": "csrf-legal" }),
      }));
      expect(window.open).toHaveBeenCalledWith("https://checkout.stripe.test/session", "_self", "noopener,noreferrer");
    });
  });

  it("sends unauthenticated public checkout attempts to signup with the current page as callback", async () => {
    window.history.pushState({}, "", "/en/pricing?plan=pro");
    global.fetch = vi.fn(async () => jsonResponse({ error: "Unauthorized" }, 401)) as typeof fetch;
    await render(
      <CheckoutButton tier="pro" cadence="monthly">
        Start Pro
      </CheckoutButton>
    );

    await click(getCheckbox());
    await click(getButton("Start Pro"));

    await waitForCondition(() => {
      expect(window.open).toHaveBeenCalledWith(
        "/signup?callbackUrl=%2Fen%2Fpricing%3Fplan%3Dpro",
        "_self",
        "noopener,noreferrer"
      );
    });
  });

  it("can opt out of the agreement UI for non-checkout reuse", async () => {
    await render(
      <CheckoutButton priceId="studio" requireLegalAgreement={false}>
        Start Studio
      </CheckoutButton>
    );

    expect(queryCheckbox()).toBeNull();
    expect(getButton("Start Studio").disabled).toBe(false);
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

function queryCheckbox(): HTMLInputElement | null {
  return (container ?? document.body).querySelector('input[type="checkbox"]');
}

function getCheckbox(): HTMLInputElement {
  const checkbox = queryCheckbox();
  if (!checkbox) throw new Error("Missing legal agreement checkbox");
  return checkbox;
}

function expectLink(label: string, href: string): void {
  const link = getLink(label);
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
}

function getLink(label: string): HTMLAnchorElement {
  const link = Array.from((container ?? document.body).querySelectorAll("a"))
    .find((element) => element.textContent?.trim() === label) as HTMLAnchorElement | undefined;
  if (!link) throw new Error(`Missing link: ${label}`);
  return link;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
