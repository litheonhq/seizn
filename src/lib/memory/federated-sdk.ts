/**
 * Federated Memory SDK — Hybrid Cloud + Local Memory
 *
 * Enables privacy-preserving memory management where:
 * - Sensitive data stays on the local device (never leaves)
 * - Non-sensitive data syncs to Seizn cloud for cross-device access
 * - Users control what syncs and what stays local
 *
 * Architecture:
 *   Local Tier → Frequently accessed, privacy-sensitive, recent context
 *   Cloud Tier → Shared knowledge, large-scale semantic search
 *   Sync Layer → Differential updates, conflict resolution, selective upload
 *
 * GDPR/Privacy compliance: data classification determines sync eligibility.
 *
 * @example
 * ```typescript
 * const memory = new FederatedMemory({
 *   apiKey: 'szn_...',
 *   userId: 'user-123',
 *   localStoragePath: './seizn-local-db',
 *   privacyMode: 'strict', // sensitive data never syncs
 * });
 *
 * // Stores locally only (PII detected)
 * await memory.store('My SSN is 123-45-6789', { privacyClass: 'restricted' });
 *
 * // Syncs to cloud (non-sensitive)
 * await memory.store('User prefers dark mode', { privacyClass: 'public' });
 *
 * // Searches both local and cloud
 * const results = await memory.search('user preferences');
 * ```
 */

// ============================================
// Types
// ============================================

export type PrivacyClass = 'public' | 'internal' | 'confidential' | 'restricted';
export type SyncDirection = 'local_only' | 'cloud_only' | 'bidirectional';
export type ConflictResolution = 'local_wins' | 'cloud_wins' | 'newest_wins' | 'manual';

export interface FederatedConfig {
  /** Seizn API key */
  apiKey: string;
  /** Seizn base URL */
  baseUrl?: string;
  /** User ID */
  userId: string;
  /** Privacy mode: 'strict' = PII never syncs, 'normal' = user controls, 'off' = everything syncs */
  privacyMode: 'strict' | 'normal' | 'off';
  /** Default sync direction */
  defaultSync: SyncDirection;
  /** How to resolve conflicts between local and cloud */
  conflictResolution: ConflictResolution;
  /** Auto-sync interval in seconds (0 = manual only) */
  syncIntervalSeconds: number;
  /** Maximum local storage size in MB */
  maxLocalStorageMB: number;
  /** PII patterns for auto-detection */
  piiPatterns?: RegExp[];
}

export interface LocalMemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  memoryType: string;
  privacyClass: PrivacyClass;
  tags: string[];
  importance: number;
  syncStatus: 'pending' | 'synced' | 'local_only' | 'conflict';
  cloudId?: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  lastAccessedAt?: Date;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  resolved: number;
  skippedPrivacy: number;
  duration: number;
}

export interface FederatedSearchResult {
  id: string;
  content: string;
  source: 'local' | 'cloud';
  relevance: number;
  privacyClass: PrivacyClass;
  memoryType: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: FederatedConfig = {
  apiKey: '',
  userId: '',
  privacyMode: 'strict',
  defaultSync: 'bidirectional',
  conflictResolution: 'newest_wins',
  syncIntervalSeconds: 300, // 5 minutes
  maxLocalStorageMB: 100,
};

// Default PII detection patterns
const DEFAULT_PII_PATTERNS: RegExp[] = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,              // SSN
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email
  /\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b/,             // Phone
  /\bpassword\s*[:=]\s*\S+/i,                     // Password
  /\b(api[_-]?key|secret|token)\s*[:=]\s*\S+/i,   // API keys
  /\b\d{6}[-]\d{7}\b/,                            // Korean resident ID
];

// ============================================
// PII Detection
// ============================================

/**
 * Detect if content contains PII (Personally Identifiable Information).
 */
export function detectPII(
  content: string,
  patterns: RegExp[] = DEFAULT_PII_PATTERNS
): { hasPII: boolean; detectedTypes: string[] } {
  const detectedTypes: string[] = [];
  const labels = ['ssn', 'credit_card', 'email', 'phone', 'password', 'api_key', 'resident_id'];

  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(content)) {
      detectedTypes.push(labels[i] || `pattern_${i}`);
    }
  }

  return { hasPII: detectedTypes.length > 0, detectedTypes };
}

/**
 * Determine privacy class based on content analysis.
 */
export function classifyPrivacy(
  content: string,
  explicitClass?: PrivacyClass,
  privacyMode: FederatedConfig['privacyMode'] = 'strict'
): PrivacyClass {
  // Explicit class always wins
  if (explicitClass) return explicitClass;

  const { hasPII, detectedTypes } = detectPII(content);

  if (privacyMode === 'off') return 'public';

  if (hasPII) {
    // SSN, credit card, resident ID → restricted
    if (detectedTypes.some((t) => ['ssn', 'credit_card', 'resident_id'].includes(t))) {
      return 'restricted';
    }
    // Email, phone, password, API keys → confidential
    return 'confidential';
  }

  // Default: internal (syncs but not publicly shared)
  return 'internal';
}

/**
 * Check if a memory is eligible for cloud sync based on privacy class.
 */
export function isSyncEligible(
  privacyClass: PrivacyClass,
  privacyMode: FederatedConfig['privacyMode']
): boolean {
  if (privacyMode === 'off') return true;

  switch (privacyClass) {
    case 'public':
      return true;
    case 'internal':
      return true;
    case 'confidential':
      return privacyMode === 'normal'; // Only sync in normal mode
    case 'restricted':
      return false; // Never sync in strict or normal mode
    default:
      return false;
  }
}

// ============================================
// Federated Memory Service
// ============================================

export class FederatedMemory {
  private config: FederatedConfig;
  private localStore: Map<string, LocalMemoryEntry> = new Map();
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<FederatedConfig> & { apiKey: string; userId: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start auto-sync if configured
    if (this.config.syncIntervalSeconds > 0) {
      this.startAutoSync();
    }
  }

  /**
   * Store a memory with privacy-aware placement.
   */
  async store(
    content: string,
    options: {
      privacyClass?: PrivacyClass;
      memoryType?: string;
      tags?: string[];
      importance?: number;
      forceLocal?: boolean;
    } = {}
  ): Promise<LocalMemoryEntry> {
    const privacyClass = classifyPrivacy(
      content,
      options.privacyClass,
      this.config.privacyMode
    );

    const entry: LocalMemoryEntry = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      memoryType: options.memoryType || 'fact',
      privacyClass,
      tags: options.tags || [],
      importance: options.importance || 5,
      syncStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0,
    };

    // Store locally
    this.localStore.set(entry.id, entry);

    // Determine if should sync to cloud
    const shouldSync =
      !options.forceLocal &&
      isSyncEligible(privacyClass, this.config.privacyMode);

    if (shouldSync) {
      try {
        const cloudResult = await this.syncToCloud(entry);
        if (cloudResult) {
          entry.syncStatus = 'synced';
          entry.cloudId = cloudResult.id;
        }
      } catch {
        entry.syncStatus = 'pending'; // Will retry on next sync
      }
    } else {
      entry.syncStatus = 'local_only';
    }

    return entry;
  }

  /**
   * Search both local and cloud memories.
   *
   * Results are merged and deduplicated by content similarity.
   */
  async search(
    query: string,
    limit: number = 10
  ): Promise<FederatedSearchResult[]> {
    const results: FederatedSearchResult[] = [];

    // 1. Search local store (simple keyword match for now)
    const localResults = this.searchLocal(query, limit);
    results.push(...localResults);

    // 2. Search cloud via API
    try {
      const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';
      const params = new URLSearchParams({
        query,
        limit: String(limit),
        mode: 'hybrid',
      });

      const response = await fetch(`${baseUrl}/v1/memories?${params}`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const cloudResults = (data.data?.results || []).map(
          (r: { id: string; content: string; similarity: number; memory_type: string }) => ({
            id: r.id,
            content: r.content,
            source: 'cloud' as const,
            relevance: r.similarity,
            privacyClass: 'internal' as PrivacyClass,
            memoryType: r.memory_type,
          })
        );
        results.push(...cloudResults);
      }
    } catch {
      // Cloud search failed, return local results only
    }

    // 3. Deduplicate by content similarity (simple string comparison)
    const deduped = deduplicateResults(results);

    // 4. Sort by relevance and limit
    return deduped
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Sync pending local memories to cloud.
   */
  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      resolved: 0,
      skippedPrivacy: 0,
      duration: 0,
    };

    // Upload pending local memories
    for (const [, entry] of this.localStore) {
      if (entry.syncStatus !== 'pending') continue;

      if (!isSyncEligible(entry.privacyClass, this.config.privacyMode)) {
        entry.syncStatus = 'local_only';
        result.skippedPrivacy++;
        continue;
      }

      try {
        const cloudResult = await this.syncToCloud(entry);
        if (cloudResult) {
          entry.syncStatus = 'synced';
          entry.cloudId = cloudResult.id;
          result.uploaded++;
        }
      } catch {
        // Keep as pending for next sync
      }
    }

    result.duration = Date.now() - start;
    return result;
  }

  /**
   * Get local storage statistics.
   */
  getLocalStats(): {
    totalEntries: number;
    synced: number;
    pendingSync: number;
    localOnly: number;
    byPrivacyClass: Record<PrivacyClass, number>;
    estimatedSizeMB: number;
  } {
    const stats = {
      totalEntries: this.localStore.size,
      synced: 0,
      pendingSync: 0,
      localOnly: 0,
      byPrivacyClass: { public: 0, internal: 0, confidential: 0, restricted: 0 },
      estimatedSizeMB: 0,
    };

    let totalChars = 0;

    for (const [, entry] of this.localStore) {
      if (entry.syncStatus === 'synced') stats.synced++;
      else if (entry.syncStatus === 'pending') stats.pendingSync++;
      else if (entry.syncStatus === 'local_only') stats.localOnly++;

      stats.byPrivacyClass[entry.privacyClass]++;
      totalChars += entry.content.length;
    }

    stats.estimatedSizeMB = totalChars / (1024 * 1024);

    return stats;
  }

  /**
   * Destroy local store and stop auto-sync.
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.localStore.clear();
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private searchLocal(query: string, limit: number): FederatedSearchResult[] {
    const queryLower = query.toLowerCase();
    const results: FederatedSearchResult[] = [];

    for (const [, entry] of this.localStore) {
      const contentLower = entry.content.toLowerCase();
      // Simple keyword relevance scoring
      const words = queryLower.split(/\s+/);
      const matchCount = words.filter((w) => contentLower.includes(w)).length;
      const relevance = matchCount / Math.max(words.length, 1);

      if (relevance > 0.3) {
        results.push({
          id: entry.id,
          content: entry.content,
          source: 'local',
          relevance,
          privacyClass: entry.privacyClass,
          memoryType: entry.memoryType,
        });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private async syncToCloud(
    entry: LocalMemoryEntry
  ): Promise<{ id: string } | null> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';

    const response = await fetch(`${baseUrl}/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        content: entry.content,
        memory_type: entry.memoryType,
        tags: [...entry.tags, 'federated', `privacy:${entry.privacyClass}`],
        importance: entry.importance,
        source: 'federated_sdk',
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return { id: data.data?.memory?.id };
  }

  private startAutoSync(): void {
    this.syncTimer = setInterval(
      () => this.sync().catch(console.error),
      this.config.syncIntervalSeconds * 1000
    );
  }
}

// ============================================
// Helpers
// ============================================

function deduplicateResults(
  results: FederatedSearchResult[]
): FederatedSearchResult[] {
  const seen = new Map<string, FederatedSearchResult>();

  for (const result of results) {
    // Simple dedup by content prefix
    const key = result.content.slice(0, 100).toLowerCase().trim();
    const existing = seen.get(key);

    if (!existing || result.relevance > existing.relevance) {
      seen.set(key, result);
    }
  }

  return Array.from(seen.values());
}

/**
 * Factory function for Federated Memory.
 */
export function createFederatedMemory(
  config: Partial<FederatedConfig> & { apiKey: string; userId: string }
): FederatedMemory {
  return new FederatedMemory(config);
}
