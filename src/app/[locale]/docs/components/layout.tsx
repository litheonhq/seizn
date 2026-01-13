// Force this route segment to be dynamic (not prerendered)
export const dynamic = 'force-dynamic';

export default function ComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
