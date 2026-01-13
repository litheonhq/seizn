'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import type { Locale } from "@/i18n/config";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

// Get nested value from object using dot notation
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current === "string") return current;
  return undefined;
}

export function ApiReferenceClient({ locale, dictionary }: Props) {
  const [isLoaded, setIsLoaded] = useState(false);

  const t = (key: string): string => {
    const value = getNestedValue(dictionary, key);
    return value ?? key;
  };

  useEffect(() => {
    // When Scalar script is loaded, it will automatically find the api-reference div
    if (isLoaded) {
      // Scalar auto-initializes when it finds the configuration
    }
  }, [isLoaded]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-white">
              Seizn<span className="text-emerald-400">.</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <Link href={`/${locale}/docs`} className="text-zinc-400 hover:text-white transition-colors">
              {t("nav.docs") === "nav.docs" ? "Docs" : t("nav.docs")}
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-white">API Reference</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href={`/${locale}/dashboard`}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={`/${locale}/login`}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              {t("nav.getStarted") === "nav.getStarted" ? "Get Started" : t("nav.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      {/* API Reference Container */}
      <div id="api-reference" className="flex-1" data-url="/docs/openapi.yaml" />

      {/* Scalar Script */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        strategy="afterInteractive"
        onLoad={() => setIsLoaded(true)}
      />

      {/* Configuration Script */}
      <script
        id="api-reference-config"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            spec: {
              url: '/docs/openapi.yaml',
            },
            theme: 'purple',
            darkMode: true,
            layout: 'modern',
            hideDarkModeToggle: true,
            showSidebar: true,
            defaultHttpClient: {
              targetKey: 'javascript',
              clientKey: 'fetch',
            },
            authentication: {
              preferredSecurityScheme: 'ApiKeyAuth',
              apiKey: {
                token: 'szn_your_api_key_here',
              },
            },
          }),
        }}
      />

      <style jsx global>{`
        #api-reference {
          min-height: calc(100vh - 73px);
        }
        /* Custom theme overrides for Scalar */
        :root {
          --scalar-color-1: #10b981 !important;
          --scalar-color-2: #059669 !important;
          --scalar-color-accent: #10b981 !important;
          --scalar-background-1: #09090b !important;
          --scalar-background-2: #18181b !important;
          --scalar-background-3: #27272a !important;
        }
        /* Hide Scalar's own header since we have our own */
        .scalar-app-header {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
