import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Seizn App',
  description: 'Built with Seizn AI Infrastructure',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
