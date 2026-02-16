import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Implicit Preference Learning Engine (PersonaMem-v2 Pattern)
 *
 * Automatically derives user preferences from interaction patterns
 * without requiring explicit statements. Users rarely state preferences
 * directly ??this engine infers them from behavior.
 *
 * Preference Types:
 * - Communication style (formal/casual, verbose/concise)
 * - Technical level (beginner/intermediate/expert)
 * - Topic interests (weighted by engagement frequency)
 * - Response format preferences (bullet points, code, etc.)
 * - Time patterns (active hours, session length)
 * - Language patterns (preferred terms, avoided topics)
 *
 * Learning Approach:
 * 1. Signal Collection: Track interaction patterns passively
 * 2. Pattern Extraction: LLM-based analysis of accumulated signals
 * 3. Profile Synthesis: Merge extracted preferences with existing profile
 * 4. Confidence Scoring: Weight preferences by signal strength
 *
 * @see https://arxiv.org/abs/2512.06688 (PersonaMem-v2)
 */

import { createServerClient } from '../supabase';

// ============================================
// Types
// ============================================

export interface InteractionSignal {
  /** Unique signal ID */
  id: string;
  /** Type of signal */
  type: SignalType;
  /** Signal value */
  value: string | number | boolean;
  /** Context in which the signal was observed */
  context?: string;
  /** Timestamp */
  timestamp: Date;
  /** Confidence in the signal (0-1) */
  confidence: number;
}

export type SignalType =
  | 'response_length_preference'    // Did user ask for shorter/longer?
  | 'format_preference'             // Code blocks? Bullet points? Paragraphs?
  | 'language_style'                // Formal/casual/technical
  | 'topic_engagement'              // What topics generate follow-ups?
  | 'correction_pattern'            // What did user correct?
  | 'positive_feedback'             // Thumbs up, "great", "thanks"
  | 'negative_feedback'             // Thumbs down, "no", "wrong"
  | 'time_pattern'                  // Active hours, session duration
  | 'complexity_preference'         // Simple vs detailed explanations
  | 'tool_preference'               // Which tools/features used most
  | 'language_preference'           // Natural language (en, ko, etc.)
  | 'avoidance_pattern';            // Topics/styles user avoids

export interface UserPreference {
  /** Preference category */
  category: string;
  /** Preference key */
  key: string;
  /** Current value */
  value: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source: how was this preference learned */
  source: 'explicit' | 'implicit' | 'inferred';
  /** Number of supporting signals */
  signalCount: number;
  /** Last updated */
  updatedAt: Date;
}

export interface PreferenceProfile {
  userId: string;
  /** All learned preferences */
  preferences: UserPreference[];
  /** Summary for LLM system prompt injection */
  promptSummary: string;
  /** When the profile was last analyzed */
  lastAnalyzedAt: Date;
  /** Total signals processed */
  totalSignals: number;
  /** Profile confidence (average of preference confidences) */
  overallConfidence: number;
}

export interface PreferenceEngineConfig {
  /** Minimum signals before extracting preferences */
  minSignalsForExtraction: number;
  /** How often to re-analyze preferences (hours) */
  reanalysisIntervalHours: number;
  /** Minimum confidence to include in profile */
  minConfidence: number;
  /** Maximum preferences to include in prompt summary */
  maxPromptPreferences: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_ENGINE_CONFIG: PreferenceEngineConfig = {
  minSignalsForExtraction: 10,
  reanalysisIntervalHours: 24,
  minConfidence: 0.5,
  maxPromptPreferences: 8,
};

// ============================================
// Signal Collection
// ============================================

/**
 * Extract interaction signals from a conversation turn.
 *
 * This is the passive observation layer ??it looks at what
 * the user says and how they interact without asking directly.
 */
export function extractSignals(
  userMessage: string,
  assistantResponse: string,
  metadata?: {
    sessionDuration?: number;
    messageIndex?: number;
    hasFollowUp?: boolean;
    userFeedback?: 'positive' | 'negative' | null;
  }
): InteractionSignal[] {
  const signals: InteractionSignal[] = [];
  const now = new Date();

  // 1. Response length preference
  if (/shorter|brief|concise|tldr|tl;dr/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_len`,
      type: 'response_length_preference',
      value: 'concise',
      context: userMessage.slice(0, 100),
      timestamp: now,
      confidence: 0.9,
    });
  } else if (/detail|elaborate|explain more|in depth/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_len`,
      type: 'response_length_preference',
      value: 'detailed',
      context: userMessage.slice(0, 100),
      timestamp: now,
      confidence: 0.9,
    });
  }

  // 2. Format preference
  if (/bullet|list|points/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_fmt`,
      type: 'format_preference',
      value: 'bullet_points',
      timestamp: now,
      confidence: 0.85,
    });
  } else if (/code|example|snippet/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_fmt`,
      type: 'format_preference',
      value: 'code_examples',
      timestamp: now,
      confidence: 0.8,
    });
  }

  // 3. Language style
  const formalIndicators = (userMessage.match(/please|kindly|would you|could you|appreciate/gi) || []).length;
  const casualIndicators = (userMessage.match(/hey|yo|lol|haha|omg|btw/gi) || []).length;

  if (formalIndicators > casualIndicators && formalIndicators > 0) {
    signals.push({
      id: `sig_${Date.now()}_style`,
      type: 'language_style',
      value: 'formal',
      timestamp: now,
      confidence: 0.6,
    });
  } else if (casualIndicators > formalIndicators && casualIndicators > 0) {
    signals.push({
      id: `sig_${Date.now()}_style`,
      type: 'language_style',
      value: 'casual',
      timestamp: now,
      confidence: 0.6,
    });
  }

  // 4. Language preference
  const koreanChars = (userMessage.match(/[\uAC00-\uD7AF]/g) || []).length;
  const totalChars = userMessage.length;
  if (koreanChars / totalChars > 0.3) {
    signals.push({
      id: `sig_${Date.now()}_lang`,
      type: 'language_preference',
      value: 'ko',
      timestamp: now,
      confidence: 0.95,
    });
  }

  // 5. Complexity preference
  if (/simple|easy|basic|beginner/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_complex`,
      type: 'complexity_preference',
      value: 'simple',
      timestamp: now,
      confidence: 0.75,
    });
  } else if (/advanced|expert|deep dive|technical/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_complex`,
      type: 'complexity_preference',
      value: 'advanced',
      timestamp: now,
      confidence: 0.75,
    });
  }

  // 6. Correction patterns (user pushes back)
  if (/no,|wrong|incorrect|actually|not what|that's not/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_correct`,
      type: 'correction_pattern',
      value: userMessage.slice(0, 200),
      timestamp: now,
      confidence: 0.7,
    });
  }

  // 7. Positive feedback
  if (metadata?.userFeedback === 'positive' || /thanks|great|perfect|awesome|helpful/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_pos`,
      type: 'positive_feedback',
      value: userMessage.slice(0, 100),
      context: assistantResponse.slice(0, 100),
      timestamp: now,
      confidence: 0.8,
    });
  }

  // 8. Negative feedback
  if (metadata?.userFeedback === 'negative' || /bad|useless|terrible|hate/i.test(userMessage)) {
    signals.push({
      id: `sig_${Date.now()}_neg`,
      type: 'negative_feedback',
      value: userMessage.slice(0, 100),
      context: assistantResponse.slice(0, 100),
      timestamp: now,
      confidence: 0.8,
    });
  }

  // 9. Topic engagement (follow-up questions indicate interest)
  if (metadata?.hasFollowUp && metadata.messageIndex !== undefined && metadata.messageIndex > 2) {
    signals.push({
      id: `sig_${Date.now()}_topic`,
      type: 'topic_engagement',
      value: userMessage.slice(0, 200),
      timestamp: now,
      confidence: 0.6,
    });
  }

  return signals;
}

// ============================================
// Pattern Extraction
// ============================================

/**
 * Analyze accumulated signals to extract user preferences.
 *
 * Uses LLM to find patterns across signals and synthesize
 * high-confidence preference statements.
 */
export async function analyzePreferences(
  userId: string,
  signals: InteractionSignal[],
  existingPreferences: UserPreference[] = [],
  config: PreferenceEngineConfig = DEFAULT_ENGINE_CONFIG
): Promise<UserPreference[]> {
  if (signals.length < config.minSignalsForExtraction) {
    return existingPreferences;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return existingPreferences;

  // Aggregate signals by type
  const byType: Record<string, InteractionSignal[]> = {};
  for (const signal of signals) {
    if (!byType[signal.type]) byType[signal.type] = [];
    byType[signal.type].push(signal);
  }

  const signalSummary = Object.entries(byType)
    .map(([type, sigs]) => {
      const values = sigs.map((s) => String(s.value)).slice(0, 10);
      return `${type} (${sigs.length} signals): ${values.join(', ')}`;
    })
    .join('\n');

  const existingStr = existingPreferences
    .map((p) => `${p.category}/${p.key}: ${p.value} (confidence: ${p.confidence})`)
    .join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: `Analyze interaction signals to extract user preferences. Return JSON array:
[{
  "category": "communication|technical|formatting|interests|behavior",
  "key": "preference_key",
  "value": "preference value",
  "confidence": 0.0-1.0,
  "source": "implicit"
}]

Rules:
- Only include preferences with strong signal support (confidence >= 0.5)
- Update existing preferences if signals contradict them
- Prefer specific over vague (e.g., "Python" over "programming")
- Maximum 15 preferences`,
        messages: [
          {
            role: 'user',
            content: `Interaction signals:\n${signalSummary}\n\nExisting preferences:\n${existingStr || 'None'}`,
          },
        ],
      }),
    });

    if (!response.ok) return existingPreferences;

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '[]';

    let extracted: Array<{
      category: string;
      key: string;
      value: string;
      confidence: number;
      source: string;
    }>;

    try {
      extracted = JSON.parse(text);
    } catch {
      return existingPreferences;
    }

    if (!Array.isArray(extracted)) return existingPreferences;

    // Merge with existing preferences
    const merged = new Map<string, UserPreference>();

    // Add existing
    for (const pref of existingPreferences) {
      merged.set(`${pref.category}/${pref.key}`, pref);
    }

    // Merge new
    for (const item of extracted) {
      if (item.confidence < config.minConfidence) continue;

      const key = `${item.category}/${item.key}`;
      const existing = merged.get(key);

      if (existing) {
        // Update if new confidence is higher
        if (item.confidence >= existing.confidence) {
          merged.set(key, {
            ...existing,
            value: item.value,
            confidence: item.confidence,
            source: 'implicit',
            signalCount: existing.signalCount + 1,
            updatedAt: new Date(),
          });
        }
      } else {
        merged.set(key, {
          category: item.category,
          key: item.key,
          value: item.value,
          confidence: item.confidence,
          source: 'implicit',
          signalCount: 1,
          updatedAt: new Date(),
        });
      }
    }

    return Array.from(merged.values());
  } catch {
    return existingPreferences;
  }
}

// ============================================
// Profile Synthesis
// ============================================

/**
 * Generate a concise prompt summary from preferences.
 *
 * This is injected into the system prompt to personalize responses.
 * Kept under ~200 tokens for efficiency (PersonaMem-v2 shows
 * 2k token memory beats 32k conversation history).
 */
export function synthesizePromptSummary(
  preferences: UserPreference[],
  maxPreferences: number = 8
): string {
  if (preferences.length === 0) return '';

  // Sort by confidence and recency
  const sorted = [...preferences]
    .filter((p) => p.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxPreferences);

  if (sorted.length === 0) return '';

  const lines = sorted.map(
    (p) => `- ${p.category}/${p.key}: ${p.value}`
  );

  return `User preferences (auto-learned):\n${lines.join('\n')}`;
}

/**
 * Build a complete preference profile for a user.
 */
export async function buildPreferenceProfile(
  userId: string,
  config: PreferenceEngineConfig = DEFAULT_ENGINE_CONFIG
): Promise<PreferenceProfile> {
  const supabase = createServerClient();

  // Load existing preferences from memory slots
  const { data: slots } = await supabase
    .from('memory_slots')
    .select('category, slot_key, value, confidence')
    .eq('user_id', userId)
    .eq('category', 'preference');

  const existingPreferences: UserPreference[] = (slots || []).map((s) => ({
    category: 'preference',
    key: s.slot_key,
    value: s.value,
    confidence: s.confidence || 0.7,
    source: 'explicit' as const,
    signalCount: 1,
    updatedAt: new Date(),
  }));

  const promptSummary = synthesizePromptSummary(existingPreferences, config.maxPromptPreferences);

  const totalConfidence = existingPreferences.reduce((sum, p) => sum + p.confidence, 0);

  return {
    userId,
    preferences: existingPreferences,
    promptSummary,
    lastAnalyzedAt: new Date(),
    totalSignals: 0,
    overallConfidence:
      existingPreferences.length > 0
        ? totalConfidence / existingPreferences.length
        : 0,
  };
}

/**
 * Store learned preferences back to the memory system.
 */
export async function storePreferences(
  userId: string,
  preferences: UserPreference[]
): Promise<number> {
  const supabase = createServerClient();
  let stored = 0;

  for (const pref of preferences) {
    if (pref.confidence < 0.5) continue;

    const { error } = await supabase.from('memory_slots').upsert(
      {
        user_id: userId,
        category: pref.category === 'preference' ? 'preference' : 'preference',
        slot_key: pref.key,
        value: pref.value,
        confidence: pref.confidence,
        is_pii: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category,slot_key' }
    );

    if (!error) stored++;
  }

  return stored;
}
