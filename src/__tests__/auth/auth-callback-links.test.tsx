import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import LoginForm from "@/app/(auth)/login/login-form";
import SignupForm from "@/app/(auth)/signup/signup-form";

const navigationMocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.routerPush,
  }),
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock("next-auth/react", () => ({
  signIn: authMocks.signIn,
}));

vi.mock("@/components/auth/Turnstile", () => ({
  default: () => null,
}));

vi.mock("@/lib/analytics", () => ({
  ttfsEvents: {
    signupCompleted: vi.fn(),
    apiKeyCreated: vi.fn(),
  },
}));

vi.mock("@/lib/onboarding/progress", () => ({
  markOnboardingStepComplete: vi.fn(),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

describe("auth callback handoff links", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.routerPush.mockReset();
    authMocks.signIn.mockReset();
    global.fetch = vi.fn();
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
  });

  it("preserves a checkout callback when signup users switch to login", async () => {
    navigationMocks.searchParams = new URLSearchParams({
      callbackUrl: "/en/pricing?plan=pro",
    });

    await render(<SignupForm />);

    expect(getLink("Sign in").getAttribute("href")).toBe(
      "/login?callbackUrl=%2Fen%2Fpricing%3Fplan%3Dpro"
    );
  });

  it("preserves a checkout callback when login users switch to signup", async () => {
    navigationMocks.searchParams = new URLSearchParams({
      callbackUrl: "/en/pricing?plan=pro",
    });

    await render(<LoginForm />);

    expect(getLink("Sign up").getAttribute("href")).toBe(
      "/signup?callbackUrl=%2Fen%2Fpricing%3Fplan%3Dpro"
    );
  });

  it("preserves a checkout callback when signup falls back to login", async () => {
    navigationMocks.searchParams = new URLSearchParams({
      callbackUrl: "/en/pricing?plan=pro",
    });
    global.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
    authMocks.signIn.mockResolvedValue({ error: "CredentialsSignin" });

    await render(<SignupForm />);
    await changeInput("signup-email", "author@example.com");
    await changeInput("signup-password", "password123");
    await changeInput("signup-confirm-password", "password123");
    await submitSignupForm();

    await waitForCondition(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({
        callbackUrl: "/en/pricing?plan=pro",
      }));
      expect(navigationMocks.routerPush).toHaveBeenCalledWith(
        "/login?message=Account+created.+Please+sign+in.&callbackUrl=%2Fen%2Fpricing%3Fplan%3Dpro"
      );
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

function getLink(label: string): HTMLAnchorElement {
  const link = Array.from((container ?? document.body).querySelectorAll("a"))
    .find((element) => element.textContent?.trim() === label) as HTMLAnchorElement | undefined;
  if (!link) throw new Error(`Missing link: ${label}`);
  return link;
}

async function changeInput(id: string, value: string): Promise<void> {
  const input = (container ?? document.body).querySelector(`#${id}`) as HTMLInputElement | null;
  if (!input) throw new Error(`Missing input: ${id}`);
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitSignupForm(): Promise<void> {
  const form = (container ?? document.body).querySelector("form");
  if (!form) throw new Error("Missing signup form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
