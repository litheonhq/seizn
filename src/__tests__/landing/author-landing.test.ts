import { existsSync, readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/[locale]/page";
import PublicApiDocsPage from "@/app/[locale]/api/page";
import ChangelogPage from "@/app/[locale]/changelog/page";
import {
  AuthorFlagshipLanding,
  getAuthorLandingCopy,
} from "@/components/landing/author-flagship-landing";
import { DETECTOR_SEED } from "@/components/landing/conflict-detector";
import { getPricingPageCopy } from "@/app/[locale]/pricing/pricing-copy";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import { loadSaebyeokDemoData } from "@/lib/sample-ip-demo";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
}));

const launchLocales = ["en", "ko", "ja", "zh-hans"] as const;
const tiers = ["indie", "pro", "studio", "enterprise"] as const;
const cadences = ["monthly", "yearly"] as const;

describe("Author flagship landing", () => {
  it("ships the Round 2.1 English master copy and section inventory", async () => {
    const copy = await getAuthorLandingCopy("en");

    expect(copy.hero.italic).toBe("contradiction");
    expect(copy.workflow.steps).toHaveLength(3);
    expect(copy.inputs.modes.map((mode) => mode.name)).toEqual([
      "Native editor",
      "DOCX import",
      "Plain text",
      "Google Docs",
    ]);
    expect(copy.conflicts.items.map((item) => item.severity)).toEqual(["critical", "major", "minor"]);
    expect(copy.trust.items.map((item) => item.title)).toContain("Workspace-isolated");
    expect(copy.trust.items.find((item) => item.title === "BYOK supported")?.body).toContain("Anthropic key");
    expect(copy.faq.items).toHaveLength(5);
    expect(copy.faq.items[3].a).toBe("Your work is isolated from sample IPs and from any public model training. The Saebyeok demo on this page is synthetic data, not a real customer.");
    expect(copy.faq.items.map((item) => item.a).join("\n")).not.toContain("CI grep");
  });

  it("keeps public landing copy free of internal codename and double quote characters", async () => {
    const strings = collectStrings(await getAuthorLandingCopy("en")).join("\n");

    expect(strings).not.toMatch(/\bKNOT\b/i);
    expect(strings).not.toContain('"');
  });

  it("renders the detector seed and class conflict reconciliation", async () => {
    const data = await loadSaebyeokDemoData();
    const copy = await getAuthorLandingCopy("en");
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en", copy }));

    expect(html).toContain(DETECTOR_SEED);
    expect(html).toContain("character.han_iseul.class = 1");
    expect(html).toContain("canon graph D30");
    expect(html).toContain("severity-cards");
  });

  it("renders the 4-track splitter and keeps Engine teaser gated", async () => {
    const data = await loadSaebyeokDemoData();
    const copy = await getAuthorLandingCopy("en");

    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en", copy }));

    expect(html).toContain("tracks-splitter");
    expect(html).toContain("Desktop app");
    expect(html).toContain('href="/en/desktop"');
    expect(html).toContain('href="/en/docs');
    expect(html).not.toContain("engine-tease");
  });

  it("shows the Engine teaser only when the Engine surface is explicitly live", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENGINE_SURFACE_LIVE", "true");
    try {
      const data = await loadSaebyeokDemoData();
      const copy = await getAuthorLandingCopy("en");
      const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en", copy }));

      expect(html).toContain("engine-tease");
      expect(html).toContain("https://engine.seizn.com");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("renders pricing cadence, secondary tiers, footer entity, and responsive hooks", async () => {
    const data = await loadSaebyeokDemoData();
    const copy = await getAuthorLandingCopy("en");
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en", copy }));

    expect(html).toContain("most picked");
    expect(html).toContain("$499 / month");
    expect(html).toContain("20M tokens / mo");
    expect(html).toContain("From $2,500 / month");
    expect(html).toContain("character-chip-strip");
    expect(html).toContain("hero-plan-picker");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('href="/en/legal/privacy"');
    expect(html).toContain('href="/en/legal/terms"');
    expect(html).toContain('href="/en/legal/beta-disclosure"');
    expect(html).toContain("track2-pricing-bridge");
    expect(html).toContain("View API · MCP plans");
    expect(html).toContain('href="/en/pricing#track-2"');
    expect(html).toContain("Create a free API key");
    expect(html).toContain("$11/mo");
    expect(html).toContain("50 calls/day");
    expect(html).toContain("© 2026 Seizn by Litheon LLC · Wyoming");
    expect(html).toContain("v1.0 · saebyeok demo is synthetic data");
  });

  it("keeps public API docs pricing synced to the v9 Track 2 catalog", async () => {
    const element = await PublicApiDocsPage({ params: Promise.resolve({ locale: "en" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("50 calls/day");
    expect(html).toContain("$11/mo");
    expect(html).toContain("$23/mo");
    expect(html).toContain("$119/mo");
    expect(html).toContain("$599/mo");
    expect(html).toContain('href="/en/pricing#track-2"');
    expect(html).not.toContain("100 calls/day");
    expect(html).not.toContain("Stripe v8 catalog");
    expect(html).not.toContain("$299");
  });

  it("keeps the public changelog Track 2 launch entry on the active v9 catalog", async () => {
    const element = await ChangelogPage({ params: Promise.resolve({ locale: "en" }) });
    const html = renderToStaticMarkup(element);
    const text = html.replaceAll("<!-- -->", "");

    expect(text).toContain("Free tier (50 calls/day)");
    expect(text).toContain("Stripe v9 catalog");
    expect(text).toContain("Indie $11/mo");
    expect(text).toContain("Pro $23/mo");
    expect(text).toContain("Studio $119/mo");
    expect(text).toContain("Studio Managed $599/mo");
    expect(text).not.toContain("100 calls/day");
    expect(text).not.toContain("Stripe v8 catalog");
    expect(text).not.toContain("$299");
  });

  it("registers Mark A favicon assets", () => {
    const root = process.cwd();

    // Note: PR #197 (main) reverted to favicon PNG approach. Mark A SVG asset
    // is preserved in public/icons/ but no longer wired into root layout metadata.
    // MAYBE_REVIEW: revisit brand direction post-merge.
    expect(existsSync(path.join(root, "public", "icons", "seizn-mark.svg"))).toBe(true);
    expect(existsSync(path.join(root, "public", "icons", "seizn-mark-16.svg"))).toBe(true);
    expect(existsSync(path.join(root, "src", "app", "icon.svg"))).toBe(true);
  });

  it("keeps the cyan stack out of the migrated landing and pricing surfaces", () => {
    const files = [
      "src/components/landing/author-flagship-landing.tsx",
      "src/components/landing/author-landing-copy.ts",
      "src/components/landing/brand-marks.tsx",
      "src/components/landing/canon-graph.tsx",
      "src/components/landing/conflict-detector.tsx",
      "src/components/landing/engine-tease.tsx",
      "src/components/landing/hero-split-detector.tsx",
      "src/components/landing/section-conflicts.tsx",
      "src/components/landing/section-faq.tsx",
      "src/components/landing/section-footer.tsx",
      "src/components/landing/section-inputs.tsx",
      "src/components/landing/section-pricing.tsx",
      "src/components/landing/section-simulation.tsx",
      "src/components/landing/section-trust.tsx",
      "src/components/landing/section-workflow.tsx",
      "src/app/[locale]/page.tsx",
      "src/app/[locale]/pricing/pricing-copy.ts",
      "src/app/[locale]/pricing/pricing-client.tsx",
    ];
    const content = files.map((file) => readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");

    expect(content).not.toMatch(/cyan-(300|500|600|700|900)|bg-cyan|text-cyan|border-cyan|shadow-cyan|from-cyan|to-cyan/);
  });

  it("renders the localized route with Phase C sample IP data", async () => {
    const element = await HomePage({ params: Promise.resolve({ locale: "en" }) });
    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
    const landing = children.find((child) => child?.props?.locale === "en");

    expect(landing).toHaveProperty("props.locale", "en");
    expect(landing).toHaveProperty("props.data.summary.characters", 8);
    expect(landing).toHaveProperty("props.data.summary.reviewCases", 50);
  });

  it("keeps the sample IP README free of private dogfood terms", async () => {
    const data = await loadSaebyeokDemoData();

    expect(data.readme.body).not.toMatch(/\bKNOT\b/i);
    expect(data.readme.body).not.toMatch(/소리|레이카|청학여고|Worldspire/);
  });

  it("ships complete pricing page copy and checkout coverage", () => {
    const copy = getPricingPageCopy("en");

    expect(copy.hero.title).toBeTruthy();
    expect(copy.launchNotes).toHaveLength(3);
    expect(copy.faq.items).toHaveLength(4);
    expect(copy.checkout.terms).toBeTruthy();
    expect(getPricingPageCopy("ko").checkout.terms).toBe("이용약관");
    expect(getPricingPageCopy("ja").checkout.terms).toBe("利用規約");
    expect(getPricingPageCopy("zh-hant").checkout.terms).toBe("服务条款");
    for (const tier of tiers) {
      expect(copy.features[tier].length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(launchLocales)("ships complete pricing page copy for %s", (locale) => {
    const copy = getPricingPageCopy(locale);

    expect(copy.hero.title).toBeTruthy();
    expect(copy.launchNotes).toHaveLength(3);
    expect(copy.faq.items).toHaveLength(4);
    expect(copy.checkout.terms).toBeTruthy();
    for (const tier of tiers) {
      expect(copy.features[tier].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps metered overage as a billing meter note, not a fifth checkout tier", () => {
    const copy = getPricingPageCopy("en");

    expect(Object.keys(AUTHOR_BILLING_TIERS)).toEqual([...tiers]);
    expect(copy.launchNotes.some((note) => note.title.includes("Metered"))).toBe(true);
  });

  it("keeps the KNOT separation gate scoped to landing and pricing build outputs", () => {
    const script = readFileSync(path.join(process.cwd(), "scripts", "verify-knot-separation.ts"), "utf8");

    expect(script).toContain('"src/app/[locale]/pricing"');
    expect(script).toContain("collectNextRouteBuildFiles");
    expect(script).not.toContain('".next/static"');
  });

  it("covers every active author tier and cadence checkout selection", () => {
    const checkoutSelections = tiers.flatMap((tier) =>
      cadences.map((cadence) => ({ tier, cadence }))
    ) satisfies Array<{ tier: AuthorBillingTier; cadence: BillingCadence }>;

    expect(checkoutSelections).toHaveLength(8);
    for (const selection of checkoutSelections) {
      expect(AUTHOR_BILLING_TIERS[selection.tier]).toBeDefined();
      expect(["monthly", "yearly"]).toContain(selection.cadence);
    }
  });
});

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}
