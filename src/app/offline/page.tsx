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
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted">
          <WifiOff className="w-10 h-10 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">You&apos;re offline</h1>
          <p className="text-muted-foreground max-w-md">
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>

            <div className="text-sm text-muted-foreground">
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
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Home className="w-4 h-4" />
          Go to Home
        </Link>
      </div>
    </div>
  );
}
