import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument, getLegalPageCopy } from "@/lib/legal-docs";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = await getLegalDocument("terms", locale);

  return {
    title: `${document.title} | Seizn`,
    description: "Seizn Terms of Service for Author and related services.",
  };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  const document = await getLegalDocument("terms", locale);

  return <LegalDocumentPage document={document} copy={getLegalPageCopy(locale)} />;
}
