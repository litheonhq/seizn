import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument, getLegalPageCopy } from "@/lib/legal-docs";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = await getLegalDocument("ai-disclosure", locale);
  return {
    title: `${document.title} | Seizn`,
    description: "Seizn AI transparency disclosure (EU AI Act Article 50, Korea AI Basic Act §31, California AB 2013).",
  };
}

export default async function AiDisclosurePage({ params }: Props) {
  const { locale } = await params;
  const document = await getLegalDocument("ai-disclosure", locale);
  return <LegalDocumentPage document={document} copy={getLegalPageCopy(locale)} />;
}
