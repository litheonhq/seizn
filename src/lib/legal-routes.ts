export const LEGAL_CONTENT_LOCALES = ["en", "ko", "ja", "zh"] as const;
export type LegalContentLocale = (typeof LEGAL_CONTENT_LOCALES)[number];

export const LEGAL_DOCUMENTS = ["privacy", "terms", "beta-disclosure", "refund", "subprocessors", "ai-disclosure"] as const;
export type LegalDocumentSlug = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_DOCUMENT_FILES: Record<LegalDocumentSlug, string> = {
  privacy: "privacy-policy.md",
  terms: "terms-of-service.md",
  "beta-disclosure": "beta-disclaimer.md",
  refund: "refund-policy.md",
  subprocessors: "subprocessors.md",
  "ai-disclosure": "ai-disclosure.md",
};

export const LEGAL_DOCUMENT_LABELS: Record<LegalContentLocale, Record<LegalDocumentSlug, string>> = {
  // W3.7 (2026-05-09): legal docs are English single SSOT. The labels stay
  // localized only because they appear in nav + breadcrumb chrome on the
  // [locale]/legal page; the underlying document content is always English.
  en: {
    privacy: "Privacy",
    terms: "Terms",
    "beta-disclosure": "Beta Disclosure",
    refund: "Refund Policy",
    subprocessors: "Sub-processors",
    "ai-disclosure": "AI Transparency",
  },
  ko: {
    privacy: "개인정보",
    terms: "이용약관",
    "beta-disclosure": "베타 고지",
    refund: "환불 정책",
    subprocessors: "수탁 처리자",
    "ai-disclosure": "AI 공시",
  },
  ja: {
    privacy: "プライバシー",
    terms: "利用規約",
    "beta-disclosure": "ベータ開示",
    refund: "返金ポリシー",
    subprocessors: "再委託先",
    "ai-disclosure": "AI 開示",
  },
  zh: {
    privacy: "隐私",
    terms: "条款",
    "beta-disclosure": "Beta 披露",
    refund: "退款政策",
    subprocessors: "次处理方",
    "ai-disclosure": "AI 披露",
  },
};

export const LEGAL_PAGE_COPY = {
  en: {
    eyebrow: "Legal",
    title: "Seizn legal documents",
    subtitle: "Review the policies that govern Seizn Author and related services.",
    backHome: "Back to Seizn",
    draftNotice: "Draft pending lawyer review",
  },
  ko: {
    eyebrow: "법무",
    title: "Seizn 법무 문서",
    subtitle: "Seizn Author와 관련 서비스에 적용되는 정책을 확인하세요.",
    backHome: "Seizn으로 돌아가기",
    draftNotice: "변호사 검토 전 초안",
  },
  ja: {
    eyebrow: "法務",
    title: "Seizn 法務文書",
    subtitle: "Seizn Author と関連サービスに適用されるポリシーを確認できます。",
    backHome: "Seizn に戻る",
    draftNotice: "弁護士レビュー前のドラフト",
  },
  zh: {
    eyebrow: "法律",
    title: "Seizn 法律文件",
    subtitle: "查看适用于 Seizn Author 及相关服务的政策。",
    backHome: "返回 Seizn",
    draftNotice: "律师审核前草案",
  },
} satisfies Record<LegalContentLocale, Record<string, string>>;

export function resolveLegalContentLocale(_locale: string | undefined | null): LegalContentLocale {
  // W3.7 (2026-05-09): legal documents are an English single SSOT. The locale
  // parameter is ignored for content resolution; only nav chrome (page eyebrow,
  // back-home label) localizes via LEGAL_PAGE_COPY. This avoids translation
  // drift between contract clauses across 4 locales.
  return "en";
}

export function getLegalDocumentLabels(
  locale: string | undefined | null,
): Record<LegalDocumentSlug, string> {
  return LEGAL_DOCUMENT_LABELS[resolveLegalContentLocale(locale)];
}

export function getLegalRouteLocale(locale: string | undefined | null): string {
  return locale && locale.length > 0 ? locale : "en";
}

export function getLegalPath(locale: string | undefined | null, documentSlug: LegalDocumentSlug): string {
  return `/${getLegalRouteLocale(locale)}/legal/${documentSlug}`;
}

export function resolveLegalMarkdownHref(
  href: string | undefined,
  locale: string,
): string | undefined {
  if (!href) return href;
  if (href === "./privacy-policy.md") return getLegalPath(locale, "privacy");
  if (href === "./terms-of-service.md") return getLegalPath(locale, "terms");
  if (href === "./beta-disclaimer.md") return getLegalPath(locale, "beta-disclosure");
  return href;
}
