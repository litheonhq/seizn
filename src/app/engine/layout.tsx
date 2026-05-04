import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seizn Engine — NPC Memory SDK",
  description:
    "NPC AI memory layer for game engines. Persistent character memory, conflict resolution, and runtime context replay across Unity, Unreal, and web engines.",
  openGraph: {
    title: "Seizn Engine — NPC Memory SDK",
    description: "NPC AI memory layer for game engines.",
    type: "website",
    url: "https://engine.seizn.com",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function EngineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a18",
        color: "#e6e6f0",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
