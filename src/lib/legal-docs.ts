import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import {
  LEGAL_DOCUMENT_FILES,
  LEGAL_DOCUMENTS,
  LEGAL_PAGE_COPY,
  getLegalDocumentLabels,
  resolveLegalContentLocale,
  type LegalContentLocale,
  type LegalDocumentSlug,
} from "@/lib/legal-routes";

export interface LegalDocument {
  slug: LegalDocumentSlug;
  title: string;
  content: string;
  contentLocale: LegalContentLocale;
  requestedLocale: string;
  metadata: Record<string, unknown>;
}

export async function getLegalDocument(
  slug: LegalDocumentSlug,
  locale: string,
): Promise<LegalDocument> {
  const contentLocale = resolveLegalContentLocale(locale);
  const filename = LEGAL_DOCUMENT_FILES[slug];
  const absolutePath = path.join(process.cwd(), "legal", contentLocale, filename);
  const source = await readFile(absolutePath, "utf8");
  const parsed = matter(source);
  const title = extractTitle(parsed.content) ?? getLegalDocumentLabels(contentLocale)[slug];

  return {
    slug,
    title,
    content: parsed.content,
    contentLocale,
    requestedLocale: locale,
    metadata: parsed.data,
  };
}

export async function getBetaDisclosureUntil(locale = "en"): Promise<string | null> {
  const document = await getLegalDocument("beta-disclosure", locale);
  const betaUntil = document.metadata.beta_until;
  if (typeof betaUntil === "string") return betaUntil;
  if (betaUntil instanceof Date && !Number.isNaN(betaUntil.getTime())) {
    return betaUntil.toISOString().slice(0, 10);
  }
  return null;
}

export function getLegalPageCopy(locale: string) {
  return LEGAL_PAGE_COPY[resolveLegalContentLocale(locale)];
}

export function assertLegalI18nComplete(): void {
  for (const locale of ["en", "ko", "ja", "zh"] as const) {
    const copy = LEGAL_PAGE_COPY[locale];
    const labels = getLegalDocumentLabels(locale);
    for (const key of ["eyebrow", "title", "subtitle", "backHome", "draftNotice"]) {
      if (!copy[key as keyof typeof copy]) {
        throw new Error(`Missing legal copy key ${locale}.${key}`);
      }
    }
    for (const slug of LEGAL_DOCUMENTS) {
      if (!labels[slug]) {
        throw new Error(`Missing legal document label ${locale}.${slug}`);
      }
    }
  }
}

export async function listLegalDocumentsForLaunchLocales(): Promise<LegalDocument[]> {
  const documents: LegalDocument[] = [];
  for (const locale of ["en", "ko", "ja", "zh"] as const) {
    for (const slug of LEGAL_DOCUMENTS) {
      documents.push(await getLegalDocument(slug, locale));
    }
  }
  return documents;
}

function extractTitle(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((value) => value.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : null;
}
