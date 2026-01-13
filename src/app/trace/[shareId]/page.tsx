import { Metadata } from 'next';
import { TraceViewerClient } from './trace-viewer-client';

interface Props {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params;

  return {
    title: `Trace ${shareId} - Seizn`,
    description: 'View shared retrieval trace with full debugging information',
    robots: 'noindex, nofollow', // Don't index shared traces
  };
}

export default async function TraceViewerPage({ params }: Props) {
  const { shareId } = await params;

  return <TraceViewerClient shareId={shareId} />;
}
