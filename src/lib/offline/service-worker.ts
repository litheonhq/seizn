/**
 * Service Worker Registration
 *
 * @module lib/offline/service-worker
 */

type SWUpdateCallback = (registration: ServiceWorkerRegistration) => void;

interface SWRegistrationOptions {
  onUpdate?: SWUpdateCallback;
  onSuccess?: SWUpdateCallback;
  onError?: (error: Error) => void;
  scope?: string;
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(
  options: SWRegistrationOptions = {}
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[SW] Service workers are not supported');
    return null;
  }

  // Only register in production or if explicitly enabled
  const isDev = process.env.NODE_ENV === 'development';
  const forceEnable = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

  if (isDev && !forceEnable) {
    console.log('[SW] Skipping registration in development');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: options.scope || '/',
    });

    console.log('[SW] Registration successful:', registration.scope);

    // Handle updates
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;

      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content available
            console.log('[SW] New content available');
            options.onUpdate?.(registration);
          } else {
            // First install
            console.log('[SW] Content cached for offline');
            options.onSuccess?.(registration);
          }
        }
      };
    };

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    options.onError?.(error as Error);
    return null;
  }
}

/**
 * Unregister the service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();
    console.log('[SW] Unregistered:', success);
    return success;
  } catch (error) {
    console.error('[SW] Unregister failed:', error);
    return false;
  }
}

/**
 * Send a message to the service worker
 */
export function sendMessageToSW(
  message: { type: string; payload?: unknown }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error('No service worker controller'));
      return;
    }

    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
  });
}

/**
 * Skip waiting and activate new service worker
 */
export function skipWaiting(): void {
  if (navigator.serviceWorker.controller) {
    sendMessageToSW({ type: 'SKIP_WAITING' });
  }
}

/**
 * Get cache status from service worker
 */
export async function getCacheStatus(): Promise<Record<string, number>> {
  try {
    const status = await sendMessageToSW({ type: 'GET_CACHE_STATUS' });
    return status as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  await sendMessageToSW({ type: 'CLEAR_CACHE' });
}

/**
 * Pre-cache specific URLs
 */
export async function precacheUrls(urls: string[]): Promise<void> {
  await sendMessageToSW({ type: 'CACHE_URLS', payload: { urls } });
}

/**
 * Listen for service worker messages
 */
export function onSWMessage(callback: (data: unknown) => void): () => void {
  const handler = (event: MessageEvent) => {
    callback(event.data);
  };

  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}
