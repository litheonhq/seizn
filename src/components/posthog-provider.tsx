"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capture, ensurePostHogLoaded } from "@/lib/posthog";

function PostHogPageView() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (search) {
        url = url + `?${search}`;
      }
      capture("$pageview", { $current_url: url });
    }
  }, [pathname, search]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensurePostHogLoaded();
  }, []);

  return (
    <>
      <PostHogPageView />
      {children}
    </>
  );
}
