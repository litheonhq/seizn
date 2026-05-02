import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/[locale]/page";
import {
  AuthorFlagshipLanding,
  getAuthorLandingCopy,
  isAuthorEngineSurfaceLive,
} from "@/components/landing/author-flagship-landing";
import {
  getPricingPageCopy,
} from "@/app/[locale]/pricing/pricing-client";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import { loadSaebyeokDemoData } from "@/lib/sample-ip-demo";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn() }),
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

  it.each(launchLocales)("ships complete landing copy for %s", (locale) => {
    const copy = getAuthorLandingCopy(locale);

    expect(copy.hero.title).toBeTruthy();
    expect(copy.demo.label).toContain("Sample IP");
    expect(copy.demo.unavailableTitle).toBeTruthy();
    expect(copy.workflow.steps).toHaveLength(3);
    expect(copy.inputs.subtitle).toBeTruthy();
    expect(copy.inputs.subtitle).not.toEqual(copy.pricing.yearlyNote);
    expect(copy.inputs.modes).toHaveLength(4);
    expect(copy.conflicts.cards).toHaveLength(3);
    expect(copy.trust.items).toHaveLength(4);
    expect(Object.keys(copy.pricing.features)).toEqual([...tiers]);
    expect(copy.footer.engine).toBeTruthy();
  });

  it("keeps the Korean hero title on an intentional two-line break only for Korean", () => {
    expect(getAuthorLandingCopy("ko").hero.title).toBe("작품의 기억을\n흩어지지 않게.");
    expect(getAuthorLandingCopy("en").hero.title).not.toContain("\n");
    expect(getAuthorLandingCopy("ja").hero.title).not.toContain("\n");
    expect(getAuthorLandingCopy("zh-hans").hero.title).not.toContain("\n");
  });

  it("gates engine cross-links behind the live surface env flag", async () => {
    const data = await loadSaebyeokDemoData();

    delete process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE;
    expect(isAuthorEngineSurfaceLive()).toBe(false);
    expect(renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }))).not.toContain("https://engine.seizn.com");

    process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE = "1";
    expect(isAuthorEngineSurfaceLive()).toBe(true);
    const liveHtml = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }));
    expect(liveHtml).toContain('href="https://engine.seizn.com"');
    expect(liveHtml).toContain('target="_blank"');
    expect(liveHtml).toContain('rel="noopener noreferrer"');
  });

  it("renders legal entity copyright without locale suffix", async () => {
    const data = await loadSaebyeokDemoData();
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "ko" }));

    expect(html).toContain("© 2026 Seizn by Litheon LLC");
    expect(html).not.toContain("© 2026 Seizn. 한국어");
  });

  it("renders the input subtitle instead of the yearly pricing note", async () => {
    const data = await loadSaebyeokDemoData();
    const copy = getAuthorLandingCopy("en");
    const html = renderToStaticMarkup(createElement(AuthorFlagshipLanding, { data, locale: "en" }));

    expect(html).toContain(copy.inputs.subtitle);
    expect(html.indexOf(copy.inputs.subtitle)).toBeLessThan(html.indexOf(copy.inputs.modes[0].name));
  });

  it("keeps the English landing copy free of non-English UI leakage", () => {
    const strings = collectStrings(getAuthorLandingCopy("en"));

    expect(strings.join("\n")).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/);
  });

  it.each(["ko", "ja", "zh-hans"] as const)("has localized non-English landing copy for %s", (locale) => {
    const strings = collectStrings(getAuthorLandingCopy(locale)).join("\n");

    if (locale === "ko") expect(strings).toMatch(/[\uac00-\ud7af]/);
    if (locale === "ja") expect(strings).toMatch(/[\u3040-\u30ff]/);
    if (locale === "zh-hans") expect(strings).toMatch(/[\u3400-\u9fff]/);
  });

  it("renders the localized landing page with Phase C sample IP data", async () => {
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

  it.each(launchLocales)("ships complete pricing page copy for %s", (locale) => {
    const copy = getPricingPageCopy(locale);

    expect(copy.hero.title).toBeTruthy();
    expect(copy.launchNotes).toHaveLength(3);
    expect(copy.faq.items).toHaveLength(4);
    expect(copy.checkout.terms).toBeTruthy();
    for (const tier of tiers) {
      expect(copy.features[tier]).toHaveLength(3);
    }
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

  it("keeps metered overage as a billing meter note, not a fifth checkout tier", () => {
    const copy = getPricingPageCopy("en");

    expect(Object.keys(AUTHOR_BILLING_TIERS)).toEqual([...tiers]);
    expect(copy.launchNotes.some((note) => note.title.includes("Metered"))).toBe(true);
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
