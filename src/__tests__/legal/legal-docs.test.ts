import { describe, expect, it } from "vitest";
import {
  assertLegalI18nComplete,
  getLegalDocument,
  listLegalDocumentsForLaunchLocales,
} from "@/lib/legal-docs";
import {
  LEGAL_DOCUMENTS,
  getLegalPath,
  resolveLegalContentLocale,
  resolveLegalMarkdownHref,
} from "@/lib/legal-routes";

describe("legal document loader", () => {
  it("loads all 4 launch locales across the 3 legal documents", async () => {
    const documents = await listLegalDocumentsForLaunchLocales();

    expect(documents).toHaveLength(12);
    for (const document of documents) {
      expect(LEGAL_DOCUMENTS).toContain(document.slug);
      expect(document.title.length).toBeGreaterThan(3);
      expect(document.content.length).toBeGreaterThan(500);
      expect(document.metadata.status).toBeTruthy();
    }
  });

  it("maps zh route variants to the shared zh legal source", async () => {
    const simplified = await getLegalDocument("privacy", "zh-hans");
    const traditional = await getLegalDocument("terms", "zh-hant");
    const bare = await getLegalDocument("beta-disclosure", "zh");

    expect(simplified.contentLocale).toBe("zh");
    expect(traditional.contentLocale).toBe("zh");
    expect(bare.contentLocale).toBe("zh");
  });

  it("keeps legal i18n copy complete for the four launch languages", () => {
    expect(() => assertLegalI18nComplete()).not.toThrow();
    expect(resolveLegalContentLocale("ko")).toBe("ko");
    expect(resolveLegalContentLocale("fr")).toBe("en");
  });

  it("builds localized legal route paths", () => {
    expect(getLegalPath("en", "privacy")).toBe("/en/legal/privacy");
    expect(getLegalPath("ko", "terms")).toBe("/ko/legal/terms");
    expect(getLegalPath("zh", "beta-disclosure")).toBe("/zh/legal/beta-disclosure");
  });

  it("rewrites relative markdown links to legal routes", () => {
    expect(resolveLegalMarkdownHref("./privacy-policy.md", "ja")).toBe("/ja/legal/privacy");
    expect(resolveLegalMarkdownHref("./terms-of-service.md", "ja")).toBe("/ja/legal/terms");
    expect(resolveLegalMarkdownHref("./beta-disclaimer.md", "ja")).toBe("/ja/legal/beta-disclosure");
    expect(resolveLegalMarkdownHref("mailto:privacy@seizn.com", "ja")).toBe("mailto:privacy@seizn.com");
  });
});
