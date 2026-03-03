"use client";

import { SessionProvider } from "next-auth/react";
import { Suspense } from "react";
import { PostHogProvider } from "./posthog-provider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider defaultTheme="system">
        <ToastProvider>
          <Suspense fallback={null}>
            <PostHogProvider>{children}</PostHogProvider>
          </Suspense>
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
