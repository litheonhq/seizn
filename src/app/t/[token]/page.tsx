import { Metadata } from "next";
import { SharedTraceView } from "./shared-trace-view";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;

  return {
    title: "Shared Trace | Seizn",
    description: "View shared RAG pipeline trace",
    openGraph: {
      title: "Shared Trace | Seizn",
      description: "View a shared RAG pipeline trace with detailed timing and results",
      url: `https://seizn.com/t/${token}`,
      type: "website",
    },
    robots: {
      index: false, // Don't index shared traces
      follow: false,
    },
  };
}

export default async function SharedTracePage({ params }: PageProps) {
  const { token } = await params;

  return <SharedTraceView token={token} />;
}
