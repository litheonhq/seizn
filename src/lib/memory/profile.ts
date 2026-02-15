/**
 * Memory Profile System (Phase 3)
 *
 * Profile cards provide instant context loading at conversation start:
 * - Compressed summary of user's memories (max 2KB)
 * - Slot snapshot for deterministic data
 * - Statistics for dashboard
 *
 * Benefits:
 * - Single query loads full user context
 * - Reduced latency at conversation start
 * - Better personalization from first message
 */

import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import { getAllSlots, type SlotData } from './slot';
import Anthropic from '@anthropic-ai/sdk';

// Profile card interface
export interface ProfileCard {
  id: string;
  userId: string;
  namespace: string;
  profileCard: string;
  slotSnapshot: Record<string, string>;
  memoryCount: number;
  slotCount: number;
  clusterCount: number;
  version: number;
  updatedAt: string;
}

// Profile generation options
export interface ProfileGenerationOptions {
  maxMemories?: number;
  maxLength?: number;
  includeSlots?: boolean;
  model?: 'haiku' | 'sonnet';
}

/**
 * Get profile card for a user/namespace
 */
export async function getProfile(
  userId: string,
  namespace: string = 'default'
): Promise<ProfileCard | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('memory_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    namespace: data.namespace,
    profileCard: data.profile_card,
    slotSnapshot: data.slot_snapshot || {},
    memoryCount: data.memory_count,
    slotCount: data.slot_count,
    clusterCount: data.cluster_count,
    version: data.version,
    updatedAt: data.updated_at,
  };
}

/**
 * Generate a new profile card from memories
 */
export async function generateProfileCard(
  userId: string,
  namespace: string = 'default',
  options: ProfileGenerationOptions = {}
): Promise<{
  profileCard: string;
  memoryCount: number;
  slotSnapshot: Record<string, string>;
}> {
  const {
    maxMemories = 100,
    maxLength = 2000,
    includeSlots = true,
    model = 'haiku',
  } = options;

  const supabase = createServerClient();

  // Get recent memories ordered by importance and recency
  const { data: memories, error: memoriesError } = await supabase
    .from('memories')
    .select('content, memory_type, importance, created_at')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .eq('is_deleted', false)
    .eq('is_encrypted', false)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(maxMemories);

  if (memoriesError) {
    console.error('Error fetching memories:', memoriesError);
    return { profileCard: '', memoryCount: 0, slotSnapshot: {} };
  }

  // Get slots
  let slotSnapshot: Record<string, string> = {};
  if (includeSlots) {
    const slots = await getAllSlots(userId, namespace);
    slotSnapshot = Object.fromEntries(
      slots.map((s: SlotData) => [s.slot_key, s.slot_value])
    );
  }

  if (!memories || memories.length === 0) {
    return {
      profileCard: '',
      memoryCount: 0,
      slotSnapshot,
    };
  }

  // Generate profile card using LLM
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const memoriesText = memories
    .map(
      (m: { content: string; memory_type: string; importance: number }) =>
        `[${m.memory_type}] (importance: ${m.importance}) ${m.content}`
    )
    .join('\n');

  const slotsText = Object.entries(slotSnapshot)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `Create a concise user profile card (max ${maxLength} characters) from the following data.

SLOTS (deterministic facts):
${slotsText || 'None'}

MEMORIES (${memories.length} items):
${memoriesText}

INSTRUCTIONS:
1. Summarize the most important facts about the user
2. Group related information together
3. Prioritize high-importance memories
4. Include preferences, restrictions, and key experiences
5. Use bullet points for clarity
6. Keep it under ${maxLength} characters
7. Start with a brief one-line summary

Output the profile card directly, no preamble:`;

  try {
    const response = await anthropic.messages.create({
      model: model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-3-5-haiku-20241022',
      max_tokens: Math.ceil(maxLength / 2),
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { profileCard: '', memoryCount: memories.length, slotSnapshot };
    }

    return {
      profileCard: content.text.slice(0, maxLength),
      memoryCount: memories.length,
      slotSnapshot,
    };
  } catch (error) {
    console.error('Profile generation error:', error);
    return { profileCard: '', memoryCount: memories.length, slotSnapshot };
  }
}

/**
 * Update profile card in database
 */
export async function updateProfile(
  userId: string,
  namespace: string = 'default',
  options: ProfileGenerationOptions = {}
): Promise<ProfileCard | null> {
  // Generate new profile card
  const { profileCard, memoryCount, slotSnapshot } = await generateProfileCard(
    userId,
    namespace,
    options
  );

  if (!profileCard) {
    return null;
  }

  const supabase = createServerClient();

  // Generate embedding for profile card
  let embedding: number[] | null = null;
  try {
    embedding = await createEmbedding(profileCard);
  } catch (error) {
    console.error('Profile embedding error:', error);
  }

  // Get cluster count
  const { count: clusterCount } = await supabase
    .from('memory_clusters')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .eq('is_archived', false);

  // Update profile
  const { data, error } = await supabase.rpc('update_profile_card', {
    p_user_id: userId,
    p_namespace: namespace,
    p_profile_card: profileCard,
    p_profile_card_embedding: embedding,
    p_slot_snapshot: slotSnapshot,
    p_memory_count: memoryCount,
    p_slot_count: Object.keys(slotSnapshot).length,
    p_cluster_count: clusterCount || 0,
  });

  if (error) {
    console.error('Update profile error:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    namespace: data.namespace,
    profileCard: data.profile_card,
    slotSnapshot: data.slot_snapshot || {},
    memoryCount: data.memory_count,
    slotCount: data.slot_count,
    clusterCount: data.cluster_count,
    version: data.version,
    updatedAt: data.updated_at,
  };
}

/**
 * Check if profile needs update
 */
export async function profileNeedsUpdate(
  userId: string,
  namespace: string = 'default',
  threshold: number = 10
): Promise<boolean> {
  const supabase = createServerClient();

  // Get current profile
  const { data: profile } = await supabase
    .from('memory_profiles')
    .select('memory_count, updated_at')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .single();

  // Get current memory count
  const { count: currentCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .eq('is_deleted', false)
    .eq('is_encrypted', false);

  if (!profile) {
    // No profile exists, needs creation
    return (currentCount || 0) > 0;
  }

  // Check if memory count has increased significantly
  const diff = (currentCount || 0) - (profile.memory_count || 0);
  if (diff >= threshold) {
    return true;
  }

  // Check if profile is old (more than 24 hours)
  const lastUpdate = new Date(profile.updated_at);
  const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
  if (hoursSinceUpdate > 24 && diff > 0) {
    return true;
  }

  return false;
}

/**
 * Get profile context for injection into conversations
 */
export async function getProfileContext(
  userId: string,
  namespace: string = 'default'
): Promise<string> {
  const profile = await getProfile(userId, namespace);

  if (!profile || !profile.profileCard) {
    return '';
  }

  // Format slots
  const slotsText = Object.entries(profile.slotSnapshot)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  return `## User Profile
${profile.profileCard}

## Known Facts
${slotsText || 'None'}

---`;
}

/**
 * Delete profile
 */
export async function deleteProfile(
  userId: string,
  namespace: string = 'default'
): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('memory_profiles')
    .delete()
    .eq('user_id', userId)
    .eq('namespace', namespace);

  if (error) {
    console.error('Delete profile error:', error);
    return false;
  }

  return true;
}
