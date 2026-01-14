/**
 * Kill Switch for Seizn
 *
 * Emergency controls to disable features without deployment.
 * Useful for incident response, cost control, and maintenance.
 */

// ============================================
// Types
// ============================================

export interface KillSwitch {
  /** Feature being controlled */
  feature: string;
  /** Whether the kill switch is active (feature is killed) */
  enabled: boolean;
  /** Reason for activation */
  reason: string;
  /** When the kill switch was activated */
  activatedAt: Date | null;
  /** Who activated it (user ID or 'system') */
  activatedBy: string | null;
  /** Auto-deactivate after this time */
  expiresAt: Date | null;
}

export type KillSwitchFeature =
  | 'reranking'
  | 'hybrid_search'
  | 'federated_search'
  | 'rag_query'
  | 'bulk_operations'
  | 'webhooks'
  | 'autopilot'
  | 'pii_detection'
  | 'answer_contract'
  | 'embeddings'
  | 'llm_calls'
  | 'ingestion'
  | 'search'
  | 'all_api'; // Nuclear option

// ============================================
// Kill Switch State
// ============================================

// In-memory store for kill switches
// In production, this should be backed by Redis or a database
const killSwitchStore = new Map<KillSwitchFeature, KillSwitch>();

// Initialize from environment variables on module load
function initializeFromEnv(): void {
  const envPrefix = 'KILL_SWITCH_';

  for (const feature of getKillSwitchFeatures()) {
    const envKey = `${envPrefix}${feature.toUpperCase()}`;
    const envValue = process.env[envKey];

    if (envValue?.toLowerCase() === 'true' || envValue === '1') {
      killSwitchStore.set(feature, {
        feature,
        enabled: true,
        reason: `Enabled via environment variable ${envKey}`,
        activatedAt: new Date(),
        activatedBy: 'system',
        expiresAt: null,
      });
    }
  }
}

// Initialize on module load
initializeFromEnv();

// ============================================
// Kill Switch Functions
// ============================================

/**
 * Get all available kill switch features
 */
export function getKillSwitchFeatures(): KillSwitchFeature[] {
  return [
    'reranking',
    'hybrid_search',
    'federated_search',
    'rag_query',
    'bulk_operations',
    'webhooks',
    'autopilot',
    'pii_detection',
    'answer_contract',
    'embeddings',
    'llm_calls',
    'ingestion',
    'search',
    'all_api',
  ];
}

/**
 * Get all current kill switch states
 */
export function getKillSwitches(): Record<KillSwitchFeature, KillSwitch> {
  const now = new Date();
  const switches: Record<string, KillSwitch> = {};

  for (const feature of getKillSwitchFeatures()) {
    const stored = killSwitchStore.get(feature);

    // Check if expired
    if (stored?.expiresAt && stored.expiresAt < now) {
      killSwitchStore.delete(feature);
    }

    const current = killSwitchStore.get(feature);

    switches[feature] = current || {
      feature,
      enabled: false,
      reason: '',
      activatedAt: null,
      activatedBy: null,
      expiresAt: null,
    };
  }

  return switches as Record<KillSwitchFeature, KillSwitch>;
}

/**
 * Get a single kill switch state
 */
export function getKillSwitch(feature: KillSwitchFeature): KillSwitch {
  const switches = getKillSwitches();
  return switches[feature];
}

/**
 * Check if a feature is killed (disabled by kill switch)
 */
export function isKilled(feature: KillSwitchFeature): boolean {
  // Check if all_api is killed (nuclear option)
  const allApi = killSwitchStore.get('all_api');
  if (allApi?.enabled) {
    const now = new Date();
    if (!allApi.expiresAt || allApi.expiresAt > now) {
      return true;
    }
  }

  const sw = getKillSwitch(feature);
  return sw.enabled;
}

/**
 * Check if a feature is killed with detailed info
 */
export function checkKillSwitch(feature: KillSwitchFeature): {
  killed: boolean;
  reason: string | null;
  retryAfter: Date | null;
} {
  // Check all_api first
  const allApi = killSwitchStore.get('all_api');
  if (allApi?.enabled) {
    const now = new Date();
    if (!allApi.expiresAt || allApi.expiresAt > now) {
      return {
        killed: true,
        reason: allApi.reason || 'All API features are temporarily disabled',
        retryAfter: allApi.expiresAt,
      };
    }
  }

  const sw = getKillSwitch(feature);

  if (!sw.enabled) {
    return { killed: false, reason: null, retryAfter: null };
  }

  return {
    killed: true,
    reason: sw.reason || `Feature ${feature} is temporarily disabled`,
    retryAfter: sw.expiresAt,
  };
}

/**
 * Activate a kill switch
 */
export function activateKillSwitch(
  feature: KillSwitchFeature,
  reason: string,
  options?: {
    activatedBy?: string;
    expiresIn?: number; // milliseconds
    expiresAt?: Date;
  }
): KillSwitch {
  const now = new Date();
  let expiresAt: Date | null = null;

  if (options?.expiresAt) {
    expiresAt = options.expiresAt;
  } else if (options?.expiresIn) {
    expiresAt = new Date(now.getTime() + options.expiresIn);
  }

  const killSwitch: KillSwitch = {
    feature,
    enabled: true,
    reason,
    activatedAt: now,
    activatedBy: options?.activatedBy || 'system',
    expiresAt,
  };

  killSwitchStore.set(feature, killSwitch);

  // Log activation
  console.warn(`[KILL SWITCH] Activated: ${feature}`, {
    reason,
    activatedBy: killSwitch.activatedBy,
    expiresAt: expiresAt?.toISOString(),
  });

  return killSwitch;
}

/**
 * Deactivate a kill switch
 */
export function deactivateKillSwitch(
  feature: KillSwitchFeature,
  deactivatedBy?: string
): void {
  const previous = killSwitchStore.get(feature);

  if (previous?.enabled) {
    console.info(`[KILL SWITCH] Deactivated: ${feature}`, {
      wasActiveFor: previous.activatedAt
        ? Date.now() - previous.activatedAt.getTime()
        : 0,
      deactivatedBy: deactivatedBy || 'system',
    });
  }

  killSwitchStore.delete(feature);
}

/**
 * Deactivate all kill switches
 */
export function deactivateAllKillSwitches(deactivatedBy?: string): void {
  const features = getKillSwitchFeatures();
  for (const feature of features) {
    deactivateKillSwitch(feature, deactivatedBy);
  }
}

/**
 * Activate kill switch with automatic expiry (for temporary outages)
 */
export function activateTemporaryKillSwitch(
  feature: KillSwitchFeature,
  reason: string,
  durationMs: number,
  activatedBy?: string
): KillSwitch {
  return activateKillSwitch(feature, reason, {
    activatedBy,
    expiresIn: durationMs,
  });
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Activate expensive feature kill switches (for cost control)
 */
export function activateCostControlMode(
  reason: string,
  activatedBy?: string
): void {
  const expensiveFeatures: KillSwitchFeature[] = [
    'reranking',
    'llm_calls',
    'answer_contract',
  ];

  for (const feature of expensiveFeatures) {
    activateKillSwitch(feature, `Cost control: ${reason}`, { activatedBy });
  }
}

/**
 * Activate maintenance mode (disable ingestion and some features)
 */
export function activateMaintenanceMode(
  reason: string,
  durationMs: number,
  activatedBy?: string
): void {
  const maintenanceFeatures: KillSwitchFeature[] = [
    'ingestion',
    'bulk_operations',
    'webhooks',
  ];

  for (const feature of maintenanceFeatures) {
    activateTemporaryKillSwitch(
      feature,
      `Maintenance: ${reason}`,
      durationMs,
      activatedBy
    );
  }
}

/**
 * Emergency stop - activate all kill switches
 */
export function activateEmergencyStop(reason: string, activatedBy?: string): void {
  activateKillSwitch('all_api', `EMERGENCY: ${reason}`, { activatedBy });
}

/**
 * Get active kill switches count
 */
export function getActiveKillSwitchCount(): number {
  let count = 0;
  killSwitchStore.forEach((sw) => {
    if (sw.enabled) {
      count++;
    }
  });
  return count;
}

/**
 * Export kill switch state for persistence
 */
export function exportKillSwitchState(): Record<KillSwitchFeature, KillSwitch | null> {
  const state: Record<string, KillSwitch | null> = {};

  for (const feature of getKillSwitchFeatures()) {
    state[feature] = killSwitchStore.get(feature) || null;
  }

  return state as Record<KillSwitchFeature, KillSwitch | null>;
}

/**
 * Import kill switch state from persistence
 */
export function importKillSwitchState(
  state: Record<KillSwitchFeature, KillSwitch | null>
): void {
  for (const [feature, sw] of Object.entries(state)) {
    if (sw && sw.enabled) {
      // Convert date strings back to Date objects
      killSwitchStore.set(feature as KillSwitchFeature, {
        ...sw,
        activatedAt: sw.activatedAt ? new Date(sw.activatedAt) : null,
        expiresAt: sw.expiresAt ? new Date(sw.expiresAt) : null,
      });
    } else {
      killSwitchStore.delete(feature as KillSwitchFeature);
    }
  }
}
