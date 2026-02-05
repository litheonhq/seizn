/**
 * Structured Profile Service (PR-021)
 *
 * Manages versioned, structured user profiles with fields for
 * about_me, preferences, constraints, tools, workstyle, and custom fields.
 *
 * Supports LLM-driven derivation from user memories and manual updates.
 * Every mutation creates a new version for full history tracking.
 *
 * @module spring/memory-v4/profile-service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Types
// =============================================================================

export interface StructuredProfile {
  userId: string;
  version: number;
  aboutMe: string;
  preferences: Record<string, unknown>;
  constraints: string[];
  tools: string[];
  workstyle: string;
  customFields: Record<string, unknown>;
  derivedFrom: 'memories' | 'manual' | 'mixed';
  updatedAt: string;
}

export type StructuredProfileUpdate = Partial<
  Pick<
    StructuredProfile,
    'aboutMe' | 'preferences' | 'constraints' | 'tools' | 'workstyle' | 'customFields'
  >
>;

interface ProfileRow {
  id: string;
  user_id: string;
  version: number;
  about_me: string;
  preferences: Record<string, unknown>;
  constraints: string[];
  tools: string[];
  workstyle: string;
  custom_fields: Record<string, unknown>;
  derived_from: 'memories' | 'manual' | 'mixed';
  created_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToProfile(row: ProfileRow): StructuredProfile {
  return {
    userId: row.user_id,
    version: row.version,
    aboutMe: row.about_me ?? '',
    preferences: row.preferences ?? {},
    constraints: row.constraints ?? [],
    tools: row.tools ?? [],
    workstyle: row.workstyle ?? '',
    customFields: row.custom_fields ?? {},
    derivedFrom: row.derived_from ?? 'manual',
    updatedAt: row.created_at,
  };
}

// =============================================================================
// Profile Service
// =============================================================================

export class ProfileService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get the current (latest version) structured profile for a user.
   */
  async getProfile(userId: string): Promise<StructuredProfile | null> {
    const { data, error } = await this.supabase
      .from('user_structured_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return rowToProfile(data as ProfileRow);
  }

  /**
   * Partially update the structured profile, creating a new version.
   *
   * Merges the provided fields into the latest version's data, bumps
   * the version number, and inserts a new row.
   */
  async updateProfile(
    userId: string,
    updates: StructuredProfileUpdate
  ): Promise<StructuredProfile> {
    const current = await this.getProfile(userId);
    const nextVersion = current ? current.version + 1 : 1;

    // Merge updates into current (or defaults)
    const merged = {
      about_me: updates.aboutMe ?? current?.aboutMe ?? '',
      preferences: updates.preferences ?? current?.preferences ?? {},
      constraints: updates.constraints ?? current?.constraints ?? [],
      tools: updates.tools ?? current?.tools ?? [],
      workstyle: updates.workstyle ?? current?.workstyle ?? '',
      custom_fields: updates.customFields ?? current?.customFields ?? {},
    };

    // Determine derivation source
    let derivedFrom: StructuredProfile['derivedFrom'] = 'manual';
    if (current?.derivedFrom === 'memories') {
      derivedFrom = 'mixed';
    } else if (current?.derivedFrom === 'mixed') {
      derivedFrom = 'mixed';
    }

    const { data, error } = await this.supabase
      .from('user_structured_profiles')
      .insert({
        user_id: userId,
        version: nextVersion,
        ...merged,
        derived_from: derivedFrom,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update structured profile: ${error.message}`);
    }

    return rowToProfile(data as ProfileRow);
  }

  /**
   * Derive a structured profile from the user's memories using an LLM.
   *
   * Fetches recent high-importance memories, passes them to Claude,
   * and parses the response into structured profile fields. The result
   * is stored as a new profile version with derivedFrom = 'memories'.
   */
  async deriveFromMemories(userId: string): Promise<StructuredProfile> {
    // Fetch memories for derivation
    const { data: memories, error: memError } = await this.supabase
      .from('memories')
      .select('content, memory_type, importance')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (memError) {
      throw new Error(`Failed to fetch memories for derivation: ${memError.message}`);
    }

    // Also try spring_memory_notes if available
    const { data: notes } = await this.supabase
      .from('spring_memory_notes')
      .select('content, note_type, confidence')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    const allMemories: string[] = [];

    if (memories && memories.length > 0) {
      for (const m of memories) {
        allMemories.push(`[${m.memory_type}] (importance: ${m.importance}) ${m.content}`);
      }
    }

    if (notes && notes.length > 0) {
      for (const n of notes) {
        allMemories.push(`[${n.note_type}] (confidence: ${n.confidence}) ${n.content}`);
      }
    }

    if (allMemories.length === 0) {
      // No memories -- create a blank profile
      return this.updateProfileAsDerivation(userId, {
        about_me: '',
        preferences: {},
        constraints: [],
        tools: [],
        workstyle: '',
        custom_fields: {},
      });
    }

    // Use LLM to derive structured profile
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `Analyze the following user memories and extract a structured profile. Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this schema:

{
  "about_me": "Brief paragraph about the user",
  "preferences": { "key": "value pairs for user preferences" },
  "constraints": ["list of constraints or limitations the user has mentioned"],
  "tools": ["list of tools, technologies, or platforms the user uses"],
  "workstyle": "Description of how the user prefers to work",
  "custom_fields": { "any other notable structured information" }
}

USER MEMORIES (${allMemories.length} items):
${allMemories.join('\n')}

Return ONLY the JSON object:`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      // Parse the JSON response
      const parsed = JSON.parse(content.text.trim());

      return this.updateProfileAsDerivation(userId, {
        about_me: typeof parsed.about_me === 'string' ? parsed.about_me : '',
        preferences: typeof parsed.preferences === 'object' && parsed.preferences !== null
          ? parsed.preferences
          : {},
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        workstyle: typeof parsed.workstyle === 'string' ? parsed.workstyle : '',
        custom_fields: typeof parsed.custom_fields === 'object' && parsed.custom_fields !== null
          ? parsed.custom_fields
          : {},
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Failed to parse LLM response as JSON during profile derivation');
      }
      throw error;
    }
  }

  /**
   * Get version history for a user's structured profile.
   */
  async getVersionHistory(
    userId: string,
    limit: number = 10
  ): Promise<StructuredProfile[]> {
    const { data, error } = await this.supabase
      .from('user_structured_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch version history: ${error.message}`);
    }

    return (data as ProfileRow[]).map(rowToProfile);
  }

  /**
   * Rollback the structured profile to a specific version.
   *
   * Creates a new version with the same content as the target version,
   * preserving the full history (no destructive edits).
   */
  async rollbackToVersion(
    userId: string,
    targetVersion: number
  ): Promise<StructuredProfile> {
    // Fetch the target version
    const { data: target, error: fetchError } = await this.supabase
      .from('user_structured_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('version', targetVersion)
      .single();

    if (fetchError || !target) {
      throw new Error(`Version ${targetVersion} not found for user ${userId}`);
    }

    const row = target as ProfileRow;

    // Get current latest version to determine the next version number
    const current = await this.getProfile(userId);
    const nextVersion = current ? current.version + 1 : 1;

    // Insert a new row replicating the target version's content
    const { data, error: insertError } = await this.supabase
      .from('user_structured_profiles')
      .insert({
        user_id: userId,
        version: nextVersion,
        about_me: row.about_me,
        preferences: row.preferences,
        constraints: row.constraints,
        tools: row.tools,
        workstyle: row.workstyle,
        custom_fields: row.custom_fields,
        derived_from: row.derived_from,
      })
      .select('*')
      .single();

    if (insertError) {
      throw new Error(`Failed to rollback to version ${targetVersion}: ${insertError.message}`);
    }

    return rowToProfile(data as ProfileRow);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Insert a derived profile version (used by deriveFromMemories).
   */
  private async updateProfileAsDerivation(
    userId: string,
    fields: {
      about_me: string;
      preferences: Record<string, unknown>;
      constraints: string[];
      tools: string[];
      workstyle: string;
      custom_fields: Record<string, unknown>;
    }
  ): Promise<StructuredProfile> {
    const current = await this.getProfile(userId);
    const nextVersion = current ? current.version + 1 : 1;

    const { data, error } = await this.supabase
      .from('user_structured_profiles')
      .insert({
        user_id: userId,
        version: nextVersion,
        ...fields,
        derived_from: 'memories',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to save derived profile: ${error.message}`);
    }

    return rowToProfile(data as ProfileRow);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createProfileService(supabase: SupabaseClient): ProfileService {
  return new ProfileService(supabase);
}
