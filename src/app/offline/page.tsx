'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

/**
 * Offline Page
 *
 * Displayed when user navigates while offline.
 */
export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setIsOnline(navigator.onLine), 0);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(id);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-szn-bg">
      <div className="text-center space-y-6 p-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-szn-surface">
          <WifiOff className="w-10 h-10 text-szn-text-3" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-szn-text-1">You&apos;re offline</h1>
          <p className="text-szn-text-2 max-w-md">
            It looks like you&apos;re not connected to the internet. Some features may not be
            available until you&apos;re back online.
          </p>
        </div>

        {isOnline ? (
          <div className="space-y-4">
            <p className="text-green-600 font-medium">
              You&apos;re back online!
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-szn-accent text-white hover:bg-szn-accent/90"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload Page
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-szn-border hover:bg-szn-surface text-szn-text-1"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try Again
            </button>

            <div className="text-sm text-szn-text-2">
              <p>While you&apos;re offline, you can still:</p>
              <ul className="mt-2 space-y-1">
                <li>• View cached memories</li>
                <li>• Create drafts (synced when online)</li>
                <li>• Access recent searches</li>
              </ul>
            </div>
          </div>
        )}

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-szn-text-2 hover:text-szn-text-1"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Go to Home
        </Link>
      </div>
    </main>
  );
}
