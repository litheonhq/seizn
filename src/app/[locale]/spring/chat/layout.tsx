import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat | Seizn Spring",
  description: "Multi-AI Chat with Memory",
};

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      {children}
    </div>
  );
}
