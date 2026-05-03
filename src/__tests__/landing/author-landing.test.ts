import { existsSync, readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/[locale]/page";
import {
  AuthorFlagshipLanding,
  getAuthorLandingCopy,
  isAuthorEngineSurfaceLive,
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

const launchLocales = ["en", "ko", "ja", "zh-hans"] as const;
const tiers = ["indie", "pro", "studio", "enterprise"] as const;
const cadences = ["monthly", "yearly"] as const;
const originalEngineSurfaceLive = process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE;

describe("Author flagship landing", () => {
  afterEach(() => {
    if (originalEngineSurfaceLive === undefined) {
      delete process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE;
    } else {
      process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE = originalEngineSurfaceLive;
    }
  });

  it("ships the Round 2.1 English master copy and section inventory", () => {
    const copy = getAuthorLandingCopy("en");

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

  it("keeps public landing copy free of internal codename and double quote characters", () => {
    const strings = collectStrings(getAuthorLandingCopy("en")).join("\n");

    expect(strings).not.toMatch(/\bKNOT\b/i);
    expect(strings).not.toContain('"');
  });

  it("renders the detector seed and class conflict reconciliation", async () => {
    const data = await loadSaebyeokDemoData();
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }));

    expect(html).toContain(DETECTOR_SEED);
    expect(html).toContain("character.han_iseul.class = 1");
    expect(html).toContain("canon graph D30");
    expect(html).toContain("severity-cards");
  });

  it("gates the engine tease behind the live surface env flag", async () => {
    const data = await loadSaebyeokDemoData();

    delete process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE;
    expect(isAuthorEngineSurfaceLive()).toBe(false);
    expect(isAuthorEngineSurfaceLive("0")).toBe(false);
    expect(isAuthorEngineSurfaceLive("false")).toBe(false);
    expect(isAuthorEngineSurfaceLive("true")).toBe(true);
    expect(isAuthorEngineSurfaceLive(" TRUE ")).toBe(true);
    expect(renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }))).not.toContain("https://engine.seizn.com");

    process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE = "1";
    expect(isAuthorEngineSurfaceLive()).toBe(true);
    const liveHtml = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }));
    expect(liveHtml).toContain("engine-tease");
    expect(liveHtml).toContain('href="https://engine.seizn.com"');
    expect(liveHtml).toContain('target="_blank"');
    expect(liveHtml).toContain('rel="noopener noreferrer"');
  });

  it("renders pricing cadence, secondary tiers, footer entity, and responsive hooks", async () => {
    const data = await loadSaebyeokDemoData();
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }));

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
    expect(html).toContain("© 2026 Seizn by Litheon LLC · Wyoming");
    expect(html).toContain("v1.0 · saebyeok demo is synthetic data");
  });

  it("registers Mark A favicon assets", () => {
    const root = process.cwd();
    const metadataFiles = [
      readFileSync(path.join(root, "src", "app", "layout.tsx"), "utf8"),
      readFileSync(path.join(root, "src", "app", "[locale]", "layout.tsx"), "utf8"),
    ].join("\n");

    expect(existsSync(path.join(root, "public", "icons", "seizn-mark.svg"))).toBe(true);
    expect(existsSync(path.join(root, "public", "icons", "seizn-mark-16.svg"))).toBe(true);
    expect(existsSync(path.join(root, "src", "app", "icon.svg"))).toBe(true);
    expect(metadataFiles).toContain("/icons/seizn-mark.svg");
    expect(metadataFiles).not.toContain("/favicon-32.png");
    expect(metadataFiles).not.toContain("/favicon-16.png");
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

    expect(element).toHaveProperty("props.locale", "en");
    expect(element).toHaveProperty("props.data.summary.characters", 8);
    expect(element).toHaveProperty("props.data.summary.reviewCases", 50);
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
