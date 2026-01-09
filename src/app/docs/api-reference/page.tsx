'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';

export default function ApiReferencePage() {
  const [isLoaded, setIsLoaded] = useState(false);

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
          <Link href="/" className="text-xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              Get Started
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
