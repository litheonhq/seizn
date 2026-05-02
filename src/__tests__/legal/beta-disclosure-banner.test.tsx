import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BetaDisclosureBanner, hasDismissedCookie } from "@/components/legal/beta-disclosure-banner";

vi.mock("@/contexts/DashboardLocaleContext", () => ({
  useDashboardTranslation: () => ({
    locale: "en",
    dictionary: {},
    isLoading: false,
    t: (key: string) => key,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

describe("BetaDisclosureBanner", () => {
  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    document.cookie = "seizn_beta_disclosure_dismissed=; Max-Age=0; path=/";
  });

  it("shows the beta disclosure link on first dashboard entry", async () => {
    await renderBanner();

    expect(await findText("Seizn Author is in beta")).toBeTruthy();
    const link = getLink("Read beta disclosure");
    expect(link.getAttribute("href")).toBe("/en/legal/beta-disclosure");
  });

  it("dismisses the banner and stores the cookie", async () => {
    await renderBanner();

    await click(await findButton("Dismiss"));

    await waitForCondition(() => {
      expect(queryText("Seizn Author is in beta")).toBeNull();
      expect(hasDismissedCookie()).toBe(true);
    });
  });
});

async function renderBanner(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<BetaDisclosureBanner />);
  });
}

function queryText(text: string): Element | null {
  const elements = Array.from((container ?? document.body).querySelectorAll("*"));
  return elements.find((element) => element.textContent === text) ?? null;
}

async function findText(text: string): Promise<Element> {
  await waitForCondition(() => {
    expect(queryText(text)).not.toBeNull();
  });
  const element = queryText(text);
  if (!element) throw new Error(`Missing text: ${text}`);
  return element;
}

function getLink(text: string): HTMLAnchorElement {
  const link = Array.from((container ?? document.body).querySelectorAll("a"))
    .find((element) => element.textContent?.trim() === text) as HTMLAnchorElement | undefined;
  if (!link) throw new Error(`Missing link: ${text}`);
  return link;
}

async function findButton(text: string): Promise<HTMLButtonElement> {
  await waitForCondition(() => {
    expect(getButton(text)).toBeTruthy();
  });
  return getButton(text);
}

function getButton(text: string): HTMLButtonElement {
  const button = Array.from((container ?? document.body).querySelectorAll("button"))
    .find((element) => element.textContent?.trim() === text) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
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
