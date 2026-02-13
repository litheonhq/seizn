'use client';

/**
 * Online Status Hook
 *
 * @module lib/offline/use-online-status
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface OnlineStatusState {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
  connectionType: string | null;
  effectiveType: string | null;
}

interface UseOnlineStatusOptions {
  /** Ping URL to verify connectivity */
  pingUrl?: string;
  /** Ping interval in ms (0 to disable) */
  pingInterval?: number;
  /** Called when going online */
  onOnline?: () => void;
  /** Called when going offline */
  onOffline?: () => void;
}

/**
 * Hook for tracking online/offline status
 *
 * @example
 * ```tsx
 * function OfflineIndicator() {
 *   const { isOnline, wasOffline, effectiveType } = useOnlineStatus({
 *     onOnline: () => toast.success('Back online!'),
 *     onOffline: () => toast.warning('You are offline'),
 *   });
 *
 *   if (!isOnline) {
 *     return <Banner>You are offline</Banner>;
 *   }
 *
 *   if (wasOffline) {
 *     return <Banner>Reconnected</Banner>;
 *   }
 *
 *   return null;
 * }
 * ```
 */
export function useOnlineStatus(options: UseOnlineStatusOptions = {}): OnlineStatusState {
  const {
    pingUrl = '/api/health',
    pingInterval = 0,
    onOnline,
    onOffline,
  } = options;

  const [state, setState] = useState<OnlineStatusState>(() => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
    lastOnlineAt: null,
    lastOfflineAt: null,
    connectionType: null,
    effectiveType: null,
  }));

  const onOnlineRef = useRef(onOnline);
  const onOfflineRef = useRef(onOffline);

  useEffect(() => {
    onOnlineRef.current = onOnline;
    onOfflineRef.current = onOffline;
  }, [onOnline, onOffline]);

  // Get connection info
  const updateConnectionInfo = useCallback(() => {
    const connection =
      (navigator as Navigator & { connection?: NetworkInformation }).connection ||
      (navigator as Navigator & { mozConnection?: NetworkInformation }).mozConnection ||
      (navigator as Navigator & { webkitConnection?: NetworkInformation }).webkitConnection;

    if (connection) {
      setState((prev) => ({
        ...prev,
        connectionType: connection.type || null,
        effectiveType: connection.effectiveType || null,
      }));
    }
  }, []);

  // Handle online event
  const handleOnline = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOnline: true,
      wasOffline: true,
      lastOnlineAt: new Date(),
    }));
    updateConnectionInfo();
    onOnlineRef.current?.();
  }, [updateConnectionInfo]);

  // Handle offline event
  const handleOffline = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOnline: false,
      lastOfflineAt: new Date(),
    }));
    onOfflineRef.current?.();
  }, []);

  // Ping to verify connectivity
  const verifyConnection = useCallback(async () => {
    try {
      const response = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
      });

      if (response.ok && !state.isOnline) {
        handleOnline();
      }
    } catch {
      if (state.isOnline) {
        handleOffline();
      }
    }
  }, [pingUrl, state.isOnline, handleOnline, handleOffline]);

  useEffect(() => {
    // Set up event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update connection info initially
    const infoId = setTimeout(() => updateConnectionInfo(), 0);

    // Listen for connection changes
    const connection =
      (navigator as Navigator & { connection?: NetworkInformation }).connection;

    if (connection) {
      connection.addEventListener('change', updateConnectionInfo);
    }

    // Set up ping interval
    let intervalId: NodeJS.Timeout | null = null;
    if (pingInterval > 0) {
      intervalId = setInterval(verifyConnection, pingInterval);
    }

    return () => {
      clearTimeout(infoId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (connection) {
        connection.removeEventListener('change', updateConnectionInfo);
      }

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [handleOnline, handleOffline, updateConnectionInfo, verifyConnection, pingInterval]);

  return state;
}

/**
 * Simplified offline detection hook
 */
export function useOfflineDetection(
  options: { onStatusChange?: (isOnline: boolean) => void } = {}
): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const onStatusChangeRef = useRef(options.onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = options.onStatusChange;
  }, [options.onStatusChange]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onStatusChangeRef.current?.(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      onStatusChangeRef.current?.(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// NetworkInformation type definition
interface NetworkInformation extends EventTarget {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}
