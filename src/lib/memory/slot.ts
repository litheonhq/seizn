/**
 * Slot Memory System (Phase 2)
 *
 * Provides O(1) deterministic lookups for structured user data:
 * - Personal info: name, email, job, company, phone
 * - Preferences: language, theme, communication style
 * - Restrictions: dietary, privacy, forbidden topics
 * - Settings: timezone, locale, notifications
 *
 * Benefits:
 * - Instant recall without vector search
 * - 100% accuracy for structured data
 * - Reduced embedding API calls
 */

import { createServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

// Slot key categories
export const SLOT_CATEGORIES = {
  user: [
    'name',
    'email',
    'phone',
    'job_title',
    'company',
    'timezone',
    'location',
    'birthday',
  ],
  preference: [
    'language',
    'theme',
    'communication_style',
    'formality',
    'response_length',
    'tech_level',
  ],
  restriction: [
    'dietary',
    'privacy',
    'topics_avoid',
    'language_avoid',
    'general',
  ],
  project: [
    'current_project',
    'tech_stack',
    'framework',
    'deployment_target',
  ],
  context: ['current_goal', 'working_on', 'deadline', 'priority'],
} as const;

// All valid slot keys
export const VALID_SLOT_KEYS = Object.entries(SLOT_CATEGORIES).flatMap(
  ([category, keys]) => keys.map((key) => `${category}.${key}`)
);

// Slot types
export type SlotType = 'string' | 'number' | 'boolean' | 'json' | 'list';

// PII categories for privacy handling
export const PII_CATEGORIES = [
  'name',
  'email',
  'phone',
  'address',
  'ssn',
  'birthday',
  'financial',
] as const;

// Slot data interface
export interface SlotData {
  slot_key: string;
  slot_value: string;
  slot_type: SlotType;
  confidence: number;
  is_pii: boolean;
  pii_category?: string;
}

// Extraction result
export interface SlotExtractionResult {
  slots: SlotData[];
  skipped: string[];
}

/**
 * Extract slot-worthy data from text using Claude
 */
export async function extractSlots(
  text: string,
  existingSlots?: Map<string, string>
): Promise<SlotExtractionResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const existingSlotsContext = existingSlots
    ? Array.from(existingSlots.entries())
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : 'None';

  const prompt = `Analyze the following text and extract any structured, deterministic information that should be stored as key-value slots.

VALID SLOT KEYS (only use these):
${VALID_SLOT_KEYS.map((k) => `- ${k}`).join('\n')}

EXISTING SLOTS (update if new info conflicts or is more specific):
${existingSlotsContext}

RULES:
1. Only extract FACTUAL, DETERMINISTIC information (not opinions or context-dependent)
2. Only use the valid slot keys listed above
3. If information conflicts with existing slots, include it with higher confidence
4. Mark PII data appropriately (name, email, phone, address, birthday, financial)
5. Skip temporary or session-specific information
6. Prefer specific values over vague descriptions

TEXT TO ANALYZE:
${text}

Respond in JSON format:
{
  "slots": [
    {
      "slot_key": "user.name",
      "slot_value": "John Smith",
      "slot_type": "string",
      "confidence": 0.95,
      "is_pii": true,
      "pii_category": "name"
    }
  ],
  "skipped": ["reason1", "reason2"]
}

If no slot-worthy information is found, return {"slots": [], "skipped": ["no deterministic data found"]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { slots: [], skipped: ['Invalid response format'] };
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { slots: [], skipped: ['No JSON in response'] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as SlotExtractionResult;

    // Validate slot keys
    const validSlots = parsed.slots.filter((s) =>
      VALID_SLOT_KEYS.includes(s.slot_key)
    );

    return {
      slots: validSlots,
      skipped: [
        ...parsed.skipped,
        ...parsed.slots
          .filter((s) => !VALID_SLOT_KEYS.includes(s.slot_key))
          .map((s) => `Invalid key: ${s.slot_key}`),
      ],
    };
  } catch (error) {
    console.error('Slot extraction error:', error);
    return { slots: [], skipped: ['Extraction failed'] };
  }
}

/**
 * Upsert a single slot value
 */
export async function upsertSlot(
  userId: string,
  slotKey: string,
  slotValue: string,
  options: {
    namespace?: string;
    slotType?: SlotType;
    confidence?: number;
    source?: string;
    sourceMemoryId?: string;
    isPii?: boolean;
    piiCategory?: string;
    expiresAt?: Date;
  } = {}
): Promise<{ success: boolean; slot?: SlotData; error?: string }> {
  if (!VALID_SLOT_KEYS.includes(slotKey)) {
    return { success: false, error: `Invalid slot key: ${slotKey}` };
  }

  const supabase = createServerClient();

  try {
    const { data, error } = await supabase.rpc('upsert_memory_slot', {
      p_user_id: userId,
      p_slot_key: slotKey,
      p_slot_value: slotValue,
      p_namespace: options.namespace || 'default',
      p_slot_type: options.slotType || 'string',
      p_confidence: options.confidence || 1.0,
      p_source: options.source || 'api',
      p_source_memory_id: options.sourceMemoryId || null,
      p_is_pii: options.isPii || false,
      p_pii_category: options.piiCategory || null,
      p_expires_at: options.expiresAt?.toISOString() || null,
    });

    if (error) {
      console.error('Upsert slot error:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      slot: {
        slot_key: data.slot_key,
        slot_value: data.slot_value,
        slot_type: data.slot_type,
        confidence: data.confidence,
        is_pii: data.is_pii,
        pii_category: data.pii_category,
      },
    };
  } catch (error) {
    console.error('Upsert slot exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch upsert multiple slots
 */
export async function upsertSlots(
  userId: string,
  slots: SlotData[],
  options: {
    namespace?: string;
    source?: string;
    sourceMemoryId?: string;
  } = {}
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const slot of slots) {
    const result = await upsertSlot(userId, slot.slot_key, slot.slot_value, {
      namespace: options.namespace,
      slotType: slot.slot_type,
      confidence: slot.confidence,
      source: options.source,
      sourceMemoryId: options.sourceMemoryId,
      isPii: slot.is_pii,
      piiCategory: slot.pii_category,
    });

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${slot.slot_key}: ${result.error}`);
    }
  }

  return results;
}

/**
 * Get slots by keys (batch lookup)
 */
export async function getSlots(
  userId: string,
  slotKeys: string[],
  namespace: string = 'default'
): Promise<Map<string, string>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase.rpc('get_memory_slots', {
      p_user_id: userId,
      p_slot_keys: slotKeys,
      p_namespace: namespace,
    });

    if (error) {
      console.error('Get slots error:', error);
      return new Map();
    }

    const result = new Map<string, string>();
    for (const slot of data || []) {
      result.set(slot.slot_key, slot.slot_value);
    }

    return result;
  } catch (error) {
    console.error('Get slots exception:', error);
    return new Map();
  }
}

/**
 * Get all slots for a user (with optional prefix filter)
 */
export async function getAllSlots(
  userId: string,
  namespace: string = 'default',
  keyPrefix?: string
): Promise<SlotData[]> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase.rpc('get_all_memory_slots', {
      p_user_id: userId,
      p_namespace: namespace,
      p_key_prefix: keyPrefix || null,
    });

    if (error) {
      console.error('Get all slots error:', error);
      return [];
    }

    return (data || []).map(
      (slot: {
        slot_key: string;
        slot_value: string;
        slot_type: string;
        confidence: number;
        is_pii: boolean;
        pii_category: string | null;
      }) => ({
        slot_key: slot.slot_key,
        slot_value: slot.slot_value,
        slot_type: slot.slot_type as SlotType,
        confidence: slot.confidence,
        is_pii: slot.is_pii,
        pii_category: slot.pii_category || undefined,
      })
    );
  } catch (error) {
    console.error('Get all slots exception:', error);
    return [];
  }
}

/**
 * Delete a slot
 */
export async function deleteSlot(
  userId: string,
  slotKey: string,
  namespace: string = 'default'
): Promise<boolean> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('memory_slots')
      .delete()
      .eq('user_id', userId)
      .eq('namespace', namespace)
      .eq('slot_key', slotKey);

    if (error) {
      console.error('Delete slot error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Delete slot exception:', error);
    return false;
  }
}

/**
 * Extract slot key from a query (for auto-router integration)
 * Returns the slot key if the query is asking for a specific slot value
 */
export function detectSlotQuery(query: string): string | null {
  const patterns: [RegExp, string][] = [
    [/^(my|the|what('?s)?)\s*name/i, 'user.name'],
    [/^(my|the|what('?s)?)\s*(email|e-mail)/i, 'user.email'],
    [/^(my|the|what('?s)?)\s*(job|title|position|role)/i, 'user.job_title'],
    [/^(my|the|what('?s)?)\s*(company|organization|org)/i, 'user.company'],
    [/^(my|the|what('?s)?)\s*(phone|tel|mobile)/i, 'user.phone'],
    [/^(my|the|what('?s)?)\s*(timezone|time\s*zone)/i, 'user.timezone'],
    [/^(my|the|what('?s)?)\s*(location|city|country)/i, 'user.location'],
    [/^(my|the|what('?s)?)\s*(birthday|birth\s*date)/i, 'user.birthday'],
    [
      /^(my|the|what('?s)?)\s*(preferred|favorite)\s*(language|lang)/i,
      'preference.language',
    ],
    [/^(my|the|what('?s)?)\s*(preferred|favorite)\s*(theme|mode)/i, 'preference.theme'],
    [
      /^(my|the|what('?s)?)\s*(communication|response)\s*(style|preference)/i,
      'preference.communication_style',
    ],
    [
      /^(my|the|what('?s)?)\s*(restriction|forbidden|avoid|dietary)/i,
      'restriction.general',
    ],
    [/^(my|the|what('?s)?)\s*(current)?\s*project/i, 'project.current_project'],
    [/^(my|the|what('?s)?)\s*(tech)?\s*stack/i, 'project.tech_stack'],
    // Korean patterns
    [/^(내|나의|제)\s*(이름)/i, 'user.name'],
    [/^(내|나의|제)\s*(이메일|메일)/i, 'user.email'],
    [/^(내|나의|제)\s*(직업|직책|직함)/i, 'user.job_title'],
    [/^(내|나의|제)\s*(회사|조직)/i, 'user.company'],
    [/^(내|나의|제)\s*(선호|좋아하는)/i, 'preference.language'],
    [/^(내|나의|제)\s*(금지|피해야|제한)/i, 'restriction.general'],
  ];

  const normalizedQuery = query.trim();

  for (const [pattern, slotKey] of patterns) {
    if (pattern.test(normalizedQuery)) {
      return slotKey;
    }
  }

  return null;
}

/**
 * Format slots for context injection
 */
export function formatSlotsForContext(slots: SlotData[]): string {
  if (slots.length === 0) return '';

  const grouped: Record<string, string[]> = {};

  for (const slot of slots) {
    const [category] = slot.slot_key.split('.');
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(`${slot.slot_key}: ${slot.slot_value}`);
  }

  return Object.entries(grouped)
    .map(([category, items]) => `[${category}]\n${items.join('\n')}`)
    .join('\n\n');
}
