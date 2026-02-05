/**
 * Utility Scoring Service
 *
 * Updates and manages utility_score for memory notes based on:
 * - Success/failure signals from runs that used the note
 * - User feedback (thumbs up/down)
 * - Hallucination detection correlation
 * - Retrieval frequency
 *
 * The utility score helps rank memories by their actual usefulness,
 * allowing the system to surface memories that have proven valuable.
 */

import type {
  MemoryNote,
  UtilityScore,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Signal about how a memory was used in a run
 */
export interface UsageSignal {
  /** ID of the trace/run where the note was used */
  traceId: string;
  /** Whether the run was successful */
  success: boolean;
  /** Whether hallucination was detected in the output */
  hallucinationDetected: boolean;
  /** Latency of the run in milliseconds */
  latencyMs?: number;
  /** Tokens saved by using cached memory vs regenerating */
  tokensSaved?: number;
  /** Timestamp of the usage */
  timestamp?: Date;
  /** Additional context about the usage */
  context?: Record<string, unknown>;
}

/**
 * User feedback on a memory
 */
export type FeedbackType = 'positive' | 'negative';

/**
 * Aggregated feedback for a note
 */
export interface FeedbackRecord {
  /** Note ID */
  noteId: string;
  /** Feedback type */
  feedback: FeedbackType;
  /** User who provided feedback */
  userId: string;
  /** Timestamp of the feedback */
  timestamp: Date;
  /** Optional reason for the feedback */
  reason?: string;
  /** Context in which feedback was given */
  context?: Record<string, unknown>;
}

/**
 * Report on utility scores for a user's memories
 */
export interface UtilityReport {
  /** User ID */
  userId: string;
  /** Total notes analyzed */
  totalNotes: number;
  /** Notes with high utility (>0.7) */
  highUtilityCount: number;
  /** Notes with medium utility (0.3-0.7) */
  mediumUtilityCount: number;
  /** Notes with low utility (<0.3) */
  lowUtilityCount: number;
  /** Average utility score */
  averageUtility: number;
  /** Top performing notes */
  topNotes: Array<{
    noteId: string;
    content: string;
    utilityScore: number;
    usageCount: number;
    successRate: number;
  }>;
  /** Notes that may need review (low utility, high usage) */
  notesNeedingReview: Array<{
    noteId: string;
    content: string;
    utilityScore: number;
    usageCount: number;
    reason: string;
  }>;
  /** Utility distribution by note type */
  utilityByType: Record<string, { average: number; count: number }>;
  /** Recent utility trends */
  recentTrends: {
    last7Days: { averageUtility: number; totalUsage: number };
    last30Days: { averageUtility: number; totalUsage: number };
  };
  /** Report generation timestamp */
  generatedAt: Date;
}

/**
 * Internal tracking of usage signals for a note
 */
interface NoteUsageTracker {
  noteId: string;
  signals: UsageSignal[];
  feedback: FeedbackRecord[];
  retrievalCount: number;
  lastRetrievedAt?: Date;
}

/**
 * Configuration for the UtilityScorerService
 */
export interface UtilityScorerConfig {
  /** Weight for success rate in utility calculation */
  successWeight?: number;
  /** Weight for feedback score in utility calculation */
  feedbackWeight?: number;
  /** Weight for hallucination penalty */
  hallucinationPenaltyWeight?: number;
  /** Weight for retrieval frequency */
  retrievalFrequencyWeight?: number;
  /** Decay factor for old signals (per day) */
  signalDecayRate?: number;
  /** Maximum signals to keep per note */
  maxSignalsPerNote?: number;
  /** Function to get notes for a user */
  getNotes?: (
    userId: string,
    options?: { noteIds?: string[]; limit?: number }
  ) => Promise<MemoryNote[]>;
  /** Function to update note utility */
  updateNoteUtility?: (
    noteId: string,
    utility: UtilityScore
  ) => Promise<void>;
  /** Function to get stored signals for a note */
  getStoredSignals?: (noteId: string) => Promise<UsageSignal[]>;
  /** Function to store a signal */
  storeSignal?: (noteId: string, signal: UsageSignal) => Promise<void>;
  /** Function to get stored feedback for a note */
  getStoredFeedback?: (noteId: string) => Promise<FeedbackRecord[]>;
  /** Function to store feedback */
  storeFeedback?: (feedback: FeedbackRecord) => Promise<void>;
  /** Function to get retrieval count */
  getRetrievalCount?: (noteId: string) => Promise<number>;
  /** Function to increment retrieval count */
  incrementRetrievalCount?: (noteId: string) => Promise<void>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG = {
  successWeight: 0.35,
  feedbackWeight: 0.25,
  hallucinationPenaltyWeight: 0.25,
  retrievalFrequencyWeight: 0.15,
  signalDecayRate: 0.95, // 5% decay per day
  maxSignalsPerNote: 100,
};

// =============================================================================
// UtilityScorerService Class
// =============================================================================

/**
 * Service for managing and calculating utility scores for memory notes
 */
export class UtilityScorerService {
  private config: Required<
    Omit<
      UtilityScorerConfig,
      | 'getNotes'
      | 'updateNoteUtility'
      | 'getStoredSignals'
      | 'storeSignal'
      | 'getStoredFeedback'
      | 'storeFeedback'
      | 'getRetrievalCount'
      | 'incrementRetrievalCount'
    >
  >;
  private getNotes?: UtilityScorerConfig['getNotes'];
  private updateNoteUtility?: UtilityScorerConfig['updateNoteUtility'];
  private getStoredSignals?: UtilityScorerConfig['getStoredSignals'];
  private storeSignal?: UtilityScorerConfig['storeSignal'];
  private getStoredFeedback?: UtilityScorerConfig['getStoredFeedback'];
  private storeFeedback?: UtilityScorerConfig['storeFeedback'];
  private getRetrievalCount?: UtilityScorerConfig['getRetrievalCount'];
  private incrementRetrievalCount?: UtilityScorerConfig['incrementRetrievalCount'];

  // In-memory cache for tracking (used when storage functions not provided)
  private usageTrackers: Map<string, NoteUsageTracker> = new Map();

  constructor(config: UtilityScorerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      successWeight: config.successWeight ?? DEFAULT_CONFIG.successWeight,
      feedbackWeight: config.feedbackWeight ?? DEFAULT_CONFIG.feedbackWeight,
      hallucinationPenaltyWeight:
        config.hallucinationPenaltyWeight ??
        DEFAULT_CONFIG.hallucinationPenaltyWeight,
      retrievalFrequencyWeight:
        config.retrievalFrequencyWeight ??
        DEFAULT_CONFIG.retrievalFrequencyWeight,
      signalDecayRate: config.signalDecayRate ?? DEFAULT_CONFIG.signalDecayRate,
      maxSignalsPerNote:
        config.maxSignalsPerNote ?? DEFAULT_CONFIG.maxSignalsPerNote,
    };
    this.getNotes = config.getNotes;
    this.updateNoteUtility = config.updateNoteUtility;
    this.getStoredSignals = config.getStoredSignals;
    this.storeSignal = config.storeSignal;
    this.getStoredFeedback = config.getStoredFeedback;
    this.storeFeedback = config.storeFeedback;
    this.getRetrievalCount = config.getRetrievalCount;
    this.incrementRetrievalCount = config.incrementRetrievalCount;
  }

  // ===========================================================================
  // Core Methods
  // ===========================================================================

  /**
   * Record a usage signal for a note
   *
   * Call this after a run that used the note to track its effectiveness
   */
  async recordUsageSignal(noteId: string, signal: UsageSignal): Promise<void> {
    const signalWithTimestamp: UsageSignal = {
      ...signal,
      timestamp: signal.timestamp ?? new Date(),
    };

    // Store the signal
    if (this.storeSignal) {
      await this.storeSignal(noteId, signalWithTimestamp);
    } else {
      // Use in-memory tracking
      const tracker = this.getOrCreateTracker(noteId);
      tracker.signals.push(signalWithTimestamp);

      // Trim old signals if exceeding limit
      if (tracker.signals.length > this.config.maxSignalsPerNote) {
        tracker.signals = tracker.signals.slice(-this.config.maxSignalsPerNote);
      }
    }

    // Immediately recalculate utility for this note
    await this.recalculateNoteUtility(noteId);
  }

  /**
   * Record user feedback for a note
   *
   * Positive feedback increases utility, negative decreases it
   */
  async recordFeedback(
    noteId: string,
    feedback: FeedbackType,
    userId?: string,
    reason?: string
  ): Promise<void> {
    const feedbackRecord: FeedbackRecord = {
      noteId,
      feedback,
      userId: userId ?? 'unknown',
      timestamp: new Date(),
      reason,
    };

    // Store the feedback
    if (this.storeFeedback) {
      await this.storeFeedback(feedbackRecord);
    } else {
      // Use in-memory tracking
      const tracker = this.getOrCreateTracker(noteId);
      tracker.feedback.push(feedbackRecord);
    }

    // Immediately recalculate utility for this note
    await this.recalculateNoteUtility(noteId);
  }

  /**
   * Record that a note was retrieved (for frequency tracking)
   */
  async recordRetrieval(noteId: string): Promise<void> {
    if (this.incrementRetrievalCount) {
      await this.incrementRetrievalCount(noteId);
    } else {
      // Use in-memory tracking
      const tracker = this.getOrCreateTracker(noteId);
      tracker.retrievalCount++;
      tracker.lastRetrievedAt = new Date();
    }
  }

  /**
   * Batch update utility scores for all notes of a user
   *
   * This is typically run periodically (e.g., daily) to update all scores
   */
  async updateUtilityScores(userId: string): Promise<void> {
    if (!this.getNotes) {
      throw new Error('getNotes function not configured');
    }

    // Get all notes for the user
    const notes = await this.getNotes(userId, { limit: 1000 });

    // Update utility for each note
    for (const note of notes) {
      try {
        await this.recalculateNoteUtility(note.id);
      } catch (error) {
        console.error(
          '[UtilityScorer] Failed to update utility for note:',
          note.id,
          error
        );
      }
    }
  }

  /**
   * Get a comprehensive utility report for a user
   */
  async getUtilityReport(userId: string): Promise<UtilityReport> {
    if (!this.getNotes) {
      throw new Error('getNotes function not configured');
    }

    const notes = await this.getNotes(userId, { limit: 1000 });

    // Calculate statistics
    let highUtilityCount = 0;
    let mediumUtilityCount = 0;
    let lowUtilityCount = 0;
    let totalUtility = 0;

    const utilityByType: Record<string, { total: number; count: number }> = {};

    const topNotes: UtilityReport['topNotes'] = [];
    const notesNeedingReview: UtilityReport['notesNeedingReview'] = [];

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let last7DaysUtility = 0;
    let last7DaysUsage = 0;
    let last30DaysUtility = 0;
    let last30DaysUsage = 0;

    for (const note of notes) {
      const utility = note.utility?.score ?? 0.5;
      const usageCount = note.utility?.usageCount ?? 0;
      const successRate = note.utility?.successRate ?? 0;

      // Count by utility level
      if (utility >= 0.7) {
        highUtilityCount++;
      } else if (utility >= 0.3) {
        mediumUtilityCount++;
      } else {
        lowUtilityCount++;
      }

      totalUtility += utility;

      // Track by type
      if (!utilityByType[note.type]) {
        utilityByType[note.type] = { total: 0, count: 0 };
      }
      utilityByType[note.type].total += utility;
      utilityByType[note.type].count++;

      // Track top notes (high utility)
      if (utility >= 0.7 && usageCount > 0) {
        topNotes.push({
          noteId: note.id,
          content: note.content.slice(0, 100) + (note.content.length > 100 ? '...' : ''),
          utilityScore: utility,
          usageCount,
          successRate,
        });
      }

      // Track notes needing review (low utility but high usage, or high hallucination)
      if (utility < 0.4 && usageCount >= 3) {
        notesNeedingReview.push({
          noteId: note.id,
          content: note.content.slice(0, 100) + (note.content.length > 100 ? '...' : ''),
          utilityScore: utility,
          usageCount,
          reason: 'Low utility despite frequent usage - may be misleading',
        });
      }

      // Track recent trends
      const noteUpdated = note.updatedAt;
      if (noteUpdated >= sevenDaysAgo) {
        last7DaysUtility += utility;
        last7DaysUsage += usageCount;
      }
      if (noteUpdated >= thirtyDaysAgo) {
        last30DaysUtility += utility;
        last30DaysUsage += usageCount;
      }
    }

    // Sort and limit top notes
    topNotes.sort((a, b) => b.utilityScore - a.utilityScore);
    const finalTopNotes = topNotes.slice(0, 10);

    // Sort and limit notes needing review
    notesNeedingReview.sort((a, b) => a.utilityScore - b.utilityScore);
    const finalNotesNeedingReview = notesNeedingReview.slice(0, 10);

    // Calculate averages for utility by type
    const utilityByTypeResult: Record<string, { average: number; count: number }> = {};
    for (const [type, data] of Object.entries(utilityByType)) {
      utilityByTypeResult[type] = {
        average: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
      };
    }

    return {
      userId,
      totalNotes: notes.length,
      highUtilityCount,
      mediumUtilityCount,
      lowUtilityCount,
      averageUtility: notes.length > 0 ? totalUtility / notes.length : 0,
      topNotes: finalTopNotes,
      notesNeedingReview: finalNotesNeedingReview,
      utilityByType: utilityByTypeResult,
      recentTrends: {
        last7Days: {
          averageUtility: last7DaysUsage > 0 ? last7DaysUtility / last7DaysUsage : 0,
          totalUsage: last7DaysUsage,
        },
        last30Days: {
          averageUtility: last30DaysUsage > 0 ? last30DaysUtility / last30DaysUsage : 0,
          totalUsage: last30DaysUsage,
        },
      },
      generatedAt: new Date(),
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get or create an in-memory usage tracker for a note
   */
  private getOrCreateTracker(noteId: string): NoteUsageTracker {
    let tracker = this.usageTrackers.get(noteId);
    if (!tracker) {
      tracker = {
        noteId,
        signals: [],
        feedback: [],
        retrievalCount: 0,
      };
      this.usageTrackers.set(noteId, tracker);
    }
    return tracker;
  }

  /**
   * Recalculate utility score for a single note
   */
  private async recalculateNoteUtility(noteId: string): Promise<void> {
    // Get signals and feedback
    const signals = this.getStoredSignals
      ? await this.getStoredSignals(noteId)
      : this.usageTrackers.get(noteId)?.signals ?? [];

    const feedback = this.getStoredFeedback
      ? await this.getStoredFeedback(noteId)
      : this.usageTrackers.get(noteId)?.feedback ?? [];

    const retrievalCount = this.getRetrievalCount
      ? await this.getRetrievalCount(noteId)
      : this.usageTrackers.get(noteId)?.retrievalCount ?? 0;

    // Calculate component scores
    const successScore = this.calculateSuccessScore(signals);
    const feedbackScore = this.calculateFeedbackScore(feedback);
    const hallucinationPenalty = this.calculateHallucinationPenalty(signals);
    const retrievalScore = this.calculateRetrievalScore(retrievalCount);

    // Combine into overall utility score
    const utilityScore =
      this.config.successWeight * successScore +
      this.config.feedbackWeight * feedbackScore -
      this.config.hallucinationPenaltyWeight * hallucinationPenalty +
      this.config.retrievalFrequencyWeight * retrievalScore;

    // Clamp to [0, 1]
    const clampedScore = Math.max(0, Math.min(1, utilityScore));

    // Calculate success rate
    const successfulSignals = signals.filter((s) => s.success).length;
    const successRate =
      signals.length > 0 ? successfulSignals / signals.length : undefined;

    // Calculate feedback score
    const positiveFeedback = feedback.filter((f) => f.feedback === 'positive').length;
    const negativeFeedback = feedback.filter((f) => f.feedback === 'negative').length;
    const netFeedback =
      feedback.length > 0
        ? (positiveFeedback - negativeFeedback) / feedback.length
        : undefined;

    // Build the utility score object
    const utility: UtilityScore = {
      score: clampedScore,
      usageCount: signals.length,
      successRate,
      feedbackScore: netFeedback !== undefined ? (netFeedback + 1) / 2 : undefined, // Normalize to 0-1
      contextualAdjustments: {
        retrievalBoost: retrievalScore,
        hallucinationPenalty,
      },
      decayFactor: this.calculateDecayFactor(signals),
    };

    // Update the note
    if (this.updateNoteUtility) {
      await this.updateNoteUtility(noteId, utility);
    }
  }

  /**
   * Calculate success score from signals (0-1)
   */
  private calculateSuccessScore(signals: UsageSignal[]): number {
    if (signals.length === 0) return 0.5; // Default neutral score

    const now = new Date();
    let weightedSuccesses = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const signalTime = signal.timestamp ?? new Date();
      const ageInDays =
        (now.getTime() - signalTime.getTime()) / (24 * 60 * 60 * 1000);

      // Apply time decay
      const weight = Math.pow(this.config.signalDecayRate, ageInDays);

      if (signal.success) {
        weightedSuccesses += weight;
      }
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSuccesses / totalWeight : 0.5;
  }

  /**
   * Calculate feedback score from user feedback (0-1)
   */
  private calculateFeedbackScore(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0.5; // Default neutral score

    const now = new Date();
    let weightedScore = 0;
    let totalWeight = 0;

    for (const record of feedback) {
      const ageInDays =
        (now.getTime() - record.timestamp.getTime()) / (24 * 60 * 60 * 1000);

      // Apply time decay
      const weight = Math.pow(this.config.signalDecayRate, ageInDays);

      // Positive = 1, Negative = 0
      const score = record.feedback === 'positive' ? 1 : 0;

      weightedScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0.5;
  }

  /**
   * Calculate hallucination penalty (0-1)
   * Higher value means more hallucinations were associated with this note
   */
  private calculateHallucinationPenalty(signals: UsageSignal[]): number {
    if (signals.length === 0) return 0;

    const now = new Date();
    let weightedHallucinations = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const signalTime = signal.timestamp ?? new Date();
      const ageInDays =
        (now.getTime() - signalTime.getTime()) / (24 * 60 * 60 * 1000);

      // Apply time decay
      const weight = Math.pow(this.config.signalDecayRate, ageInDays);

      if (signal.hallucinationDetected) {
        weightedHallucinations += weight;
      }
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedHallucinations / totalWeight : 0;
  }

  /**
   * Calculate retrieval frequency score (0-1)
   * Notes that are retrieved more often get a boost
   */
  private calculateRetrievalScore(retrievalCount: number): number {
    // Use logarithmic scaling to avoid over-weighting very frequent retrievals
    // Score approaches 1 as retrieval count increases
    if (retrievalCount === 0) return 0;

    // Log scale: 10 retrievals = 0.5, 100 = 0.75, 1000 = 0.9
    const score = Math.log10(retrievalCount + 1) / Math.log10(1001);
    return Math.min(1, score);
  }

  /**
   * Calculate decay factor based on recency of signals
   */
  private calculateDecayFactor(signals: UsageSignal[]): number {
    if (signals.length === 0) return 1.0; // No decay if no signals

    // Find the most recent signal
    const now = new Date();
    let mostRecentDaysAgo = Infinity;

    for (const signal of signals) {
      const signalTime = signal.timestamp ?? new Date();
      const ageInDays =
        (now.getTime() - signalTime.getTime()) / (24 * 60 * 60 * 1000);

      if (ageInDays < mostRecentDaysAgo) {
        mostRecentDaysAgo = ageInDays;
      }
    }

    // Apply exponential decay based on time since last signal
    return Math.pow(this.config.signalDecayRate, mostRecentDaysAgo);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new UtilityScorerService instance
 */
export function createUtilityScorerService(
  config?: UtilityScorerConfig
): UtilityScorerService {
  return new UtilityScorerService(config);
}

// =============================================================================
// Exports
// =============================================================================

export default UtilityScorerService;
