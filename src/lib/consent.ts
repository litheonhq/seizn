/**
 * Cookie consent state machine (plan W3.8).
 *
 * Three tiers per GDPR best practice + Google Consent Mode v2:
 *   1. necessary  — auth, csrf, locale. Always ON. Cannot be disabled.
 *   2. analytics  — PostHog, Google Analytics (when NEXT_PUBLIC_GA_MEASUREMENT_ID set).
 *                   Plausible (self-hosted) is exempt — cookieless + no personal data.
 *   3. marketing  — ad pixels (Meta, X, etc.). Currently no marketing pixels live;
 *                   reserved for future.
 *
 * Storage: localStorage key `cookie_consent` with shape:
 *   { necessary: true, analytics: bool, marketing: bool, version: string, decided_at: ISO }
 *
 * Version bump policy:
 *   When LATEST_VERSION changes, prior decisions are invalidated and the banner
 *   re-shows. Used when sub-processors change materially (e.g., new analytics
 *   provider added that needs fresh consent).
 */

export const CONSENT_STORAGE_KEY = 'cookie_consent';
export const LATEST_VERSION = '1.0';

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  version: string;
  decided_at: string; // ISO timestamp
}

const NULL_STATE: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  version: LATEST_VERSION,
  decided_at: new Date(0).toISOString(),
};

export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== LATEST_VERSION) return null;
    if (typeof parsed.decided_at !== 'string') return null;
    return {
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      version: LATEST_VERSION,
      decided_at: parsed.decided_at,
    };
  } catch {
    return null;
  }
}

export function writeConsent(state: Omit<ConsentState, 'necessary' | 'version' | 'decided_at'>): ConsentState {
  const full: ConsentState = {
    necessary: true,
    analytics: state.analytics,
    marketing: state.marketing,
    version: LATEST_VERSION,
    decided_at: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent('seizn-consent-change', { detail: full }));
    // Google Consent Mode v2 — push update so gtag picks up the new state.
    const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', {
        analytics_storage: state.analytics ? 'granted' : 'denied',
        ad_storage: state.marketing ? 'granted' : 'denied',
        ad_user_data: state.marketing ? 'granted' : 'denied',
        ad_personalization: state.marketing ? 'granted' : 'denied',
      });
    }
  }
  return full;
}

export function clearConsent(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('seizn-consent-change', { detail: NULL_STATE }));
}

export function effectiveConsent(): ConsentState {
  return readConsent() ?? NULL_STATE;
}
