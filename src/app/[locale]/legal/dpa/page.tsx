import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument, getLegalPageCopy } from "@/lib/legal-docs";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = await getLegalDocument("dpa", locale);
  return {
    title: `${document.title} | Seizn`,
    description: "Seizn Data Processing Agreement (GDPR Art. 28-compatible).",
  };
}

export default async function DpaPage({ params }: Props) {
  const { locale } = await params;
  const document = await getLegalDocument("dpa", locale);
  return <LegalDocumentPage document={document} copy={getLegalPageCopy(locale)} />;
}
