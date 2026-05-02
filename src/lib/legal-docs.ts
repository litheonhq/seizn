import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import {
  LEGAL_DOCUMENT_FILES,
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENTS,
  LEGAL_PAGE_COPY,
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
  const title = extractTitle(parsed.content) ?? LEGAL_DOCUMENT_LABELS[slug];

  return {
    slug,
    title,
    content: parsed.content,
    contentLocale,
    requestedLocale: locale,
    metadata: parsed.data,
  };
}

export function getLegalPageCopy(locale: string) {
  return LEGAL_PAGE_COPY[resolveLegalContentLocale(locale)];
}

export function assertLegalI18nComplete(): void {
  for (const locale of ["en", "ko", "ja", "zh"] as const) {
    const copy = LEGAL_PAGE_COPY[locale];
    for (const key of ["eyebrow", "title", "subtitle", "backHome", "draftNotice"]) {
      if (!copy[key as keyof typeof copy]) {
        throw new Error(`Missing legal copy key ${locale}.${key}`);
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
