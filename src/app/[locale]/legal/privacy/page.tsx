import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument, getLegalPageCopy } from "@/lib/legal-docs";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = await getLegalDocument("privacy", locale);

  return {
    title: `${document.title} | Seizn`,
    description: "Seizn Privacy Policy for Author and related services.",
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  const document = await getLegalDocument("privacy", locale);

  return <LegalDocumentPage document={document} copy={getLegalPageCopy(locale)} />;
}
