import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument, getLegalPageCopy } from "@/lib/legal-docs";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const document = await getLegalDocument("subprocessors", locale);
  return {
    title: `${document.title} | Seizn`,
    description: "Seizn sub-processors and data processing engagements.",
  };
}

export default async function SubprocessorsPage({ params }: Props) {
  const { locale } = await params;
  const document = await getLegalDocument("subprocessors", locale);
  return <LegalDocumentPage document={document} copy={getLegalPageCopy(locale)} />;
}
