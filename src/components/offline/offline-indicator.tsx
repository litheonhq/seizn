'use client';

/**
 * Offline Indicator Component
 *
 * Shows a banner when offline and sync status.
 */

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useOffline } from '@/hooks/useOffline';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  /** Position of the indicator */
  position?: 'top' | 'bottom';
  /** Auto-hide when back online */
  autoHide?: boolean;
  /** Auto-hide delay in ms */
  autoHideDelay?: number;
}

export function OfflineIndicator({
  position = 'bottom',
  autoHide = true,
  autoHideDelay = 3000,
}: OfflineIndicatorProps) {
  const { isOnline, wasOffline, pendingCount, syncStatus, syncNow } = useOffline();
  const [visible, setVisible] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  // Show indicator when offline
  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      setShowReconnected(true);

      if (autoHide) {
        const timer = setTimeout(() => {
          setVisible(false);
          setShowReconnected(false);
        }, autoHideDelay);

        return () => clearTimeout(timer);
      }
    }
  }, [isOnline, wasOffline, autoHide, autoHideDelay]);

  if (!visible && !showReconnected) return null;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 px-4 py-2 transition-all duration-300',
        position === 'top' ? 'top-0' : 'bottom-0',
        !isOnline
          ? 'bg-destructive text-destructive-foreground'
          : showReconnected
            ? 'bg-green-600 text-white'
            : 'bg-muted'
      )}
    >
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4" />
              <span className="text-sm font-medium">
                You&apos;re offline
                {pendingCount > 0 && ` • ${pendingCount} pending changes`}
              </span>
            </>
          ) : showReconnected ? (
            <>
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Back online</span>
            </>
          ) : null}
        </div>

        {!isOnline && pendingCount > 0 && (
          <span className="text-xs opacity-80">
            Changes will sync when you&apos;re back online
          </span>
        )}

        {isOnline && syncStatus.isSyncing && (
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}

        {isOnline && !syncStatus.isSyncing && pendingCount > 0 && (
          <button
            onClick={() => syncNow()}
            className="flex items-center gap-1 text-sm underline hover:no-underline"
          >
            <RefreshCw className="h-3 w-3" />
            Sync now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact offline badge for navbar
 */
export function OfflineBadge() {
  const { isOnline, pendingCount, syncStatus } = useOffline();

  if (isOnline && pendingCount === 0 && !syncStatus.isSyncing) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        !isOnline
          ? 'bg-destructive/10 text-destructive'
          : syncStatus.isSyncing
            ? 'bg-blue-100 text-blue-700'
            : 'bg-yellow-100 text-yellow-700'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      ) : syncStatus.isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing</span>
        </>
      ) : (
        <>
          <AlertCircle className="h-3 w-3" />
          <span>{pendingCount} pending</span>
        </>
      )}
    </div>
  );
}
