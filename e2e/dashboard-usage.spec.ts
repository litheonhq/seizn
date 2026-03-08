import { expect, test } from "@playwright/test";

test.describe("Dashboard Usage", () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const allowAutoProvision =
    process.env.PLAYWRIGHT_DISABLE_TURNSTILE === "1" || process.env.E2E_ALLOW_AUTO_PROVISION === "1";
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+usage-${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!Usage${runId}Aa`;

  test.skip(
    !hasCreds && !allowAutoProvision,
    "Requires TEST_USER_EMAIL/TEST_USER_PASSWORD (or enable auto-provision with PLAYWRIGHT_DISABLE_TURNSTILE=1)"
  );

  test.beforeAll(async ({ request }) => {
    if (hasCreds || !allowAutoProvision) return;

    const res = await request.post("/api/auth/signup", {
      data: {
        email,
        password,
        name: "E2E Usage User",
      },
    });

    if (!res.ok()) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to provision e2e user via /api/auth/signup (status ${res.status()}): ${body}`
      );
    }
  });

  test("authenticated user can open the usage dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);

    await page.goto("/dashboard/usage");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Usage/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /7 days|7d/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /30 days|30d/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /90 days|90d/i })).toBeVisible();
    await expect(page.locator("text=Failed to fetch usage")).toHaveCount(0);
  });
});
