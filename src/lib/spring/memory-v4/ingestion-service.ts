/**
 * Ingestion Service
 *
 * Manages memory ingestion controls, rules, and settings.
 * Implements Mem0-style "controlling what gets remembered" pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IngestionRule,
  IngestionRuleInput,
  IngestionSettings,
  IngestionSettingsInput,
  IngestionDecision,
  IngestionAction,
  StrictnessLevel,
  STRICTNESS_THRESHOLDS,
} from './types';

// =============================================================================
// Ingestion Service
// =============================================================================

export class IngestionService {
  constructor(private supabase: SupabaseClient) {}

  // ===========================================================================
  // Ingestion Settings
  // ===========================================================================

  /**
   * Get user's ingestion settings
   */
  async getSettings(userId: string): Promise<IngestionSettings> {
    const { data, error } = await this.supabase
      .rpc('get_ingestion_settings', { p_user_id: userId })
      .single();

    if (error || !data) {
      console.error('Failed to get ingestion settings:', error);
      // Return defaults
      return {
        userId,
        autoSaveEnabled: true,
        candidateModeEnabled: false,
        defaultConfidenceThreshold: 0.75,
        strictness: 'medium',
        blockedCategories: [],
        blockedPatterns: [],
        sensitiveCapsuleEnabled: true,
        sensitiveCategories: ['health', 'finance', 'auth', 'secrets'],
      };
    }

    // Type assertion for RPC response
    const row = data as {
      auto_save_enabled?: boolean;
      candidate_mode_enabled?: boolean;
      default_confidence_threshold?: string | number;
      strictness?: string;
      blocked_categories?: string[];
      blocked_patterns?: string[];
      sensitive_capsule_enabled?: boolean;
      sensitive_categories?: string[];
    };

    return {
      userId,
      autoSaveEnabled: row.auto_save_enabled ?? true,
      candidateModeEnabled: row.candidate_mode_enabled ?? false,
      defaultConfidenceThreshold: parseFloat(String(row.default_confidence_threshold ?? 0.75)),
      strictness: (row.strictness as StrictnessLevel) ?? 'medium',
      blockedCategories: row.blocked_categories || [],
      blockedPatterns: row.blocked_patterns || [],
      sensitiveCapsuleEnabled: row.sensitive_capsule_enabled ?? true,
      sensitiveCategories: row.sensitive_categories || [],
    };
  }

  /**
   * Update user's ingestion settings
   */
  async updateSettings(
    userId: string,
    input: IngestionSettingsInput
  ): Promise<IngestionSettings> {
    const updates: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (input.autoSaveEnabled !== undefined) {
      updates.auto_save_enabled = input.autoSaveEnabled;
    }
    if (input.candidateModeEnabled !== undefined) {
      updates.candidate_mode_enabled = input.candidateModeEnabled;
    }
    if (input.defaultConfidenceThreshold !== undefined) {
      updates.default_confidence_threshold = input.defaultConfidenceThreshold;
    }
    if (input.strictness !== undefined) {
      updates.strictness = input.strictness;
    }
    if (input.blockedCategories !== undefined) {
      updates.blocked_categories = input.blockedCategories;
    }
    if (input.blockedPatterns !== undefined) {
      updates.blocked_patterns = input.blockedPatterns;
    }
    if (input.sensitiveCapsuleEnabled !== undefined) {
      updates.sensitive_capsule_enabled = input.sensitiveCapsuleEnabled;
    }
    if (input.sensitiveCategories !== undefined) {
      updates.sensitive_categories = input.sensitiveCategories;
    }

    const { error } = await this.supabase
      .from('spring_ingestion_settings')
      .upsert(updates, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`Failed to update ingestion settings: ${error.message}`);
    }

    return this.getSettings(userId);
  }

  // ===========================================================================
  // Ingestion Rules
  // ===========================================================================

  /**
   * List user's ingestion rules
   */
  async listRules(
    userId: string,
    options?: {
      workspaceId?: string;
      enabledOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<IngestionRule[]> {
    let query = this.supabase
      .from('spring_ingestion_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (options?.workspaceId) {
      query = query.or(`workspace_id.eq.${options.workspaceId},workspace_id.is.null`);
    }

    if (options?.enabledOnly) {
      query = query.eq('enabled', true);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list ingestion rules: ${error.message}`);
    }

    return (data || []).map(this.mapRuleFromDb);
  }

  /**
   * Get a single ingestion rule
   */
  async getRule(ruleId: string): Promise<IngestionRule | null> {
    const { data, error } = await this.supabase
      .from('spring_ingestion_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get ingestion rule: ${error.message}`);
    }

    return this.mapRuleFromDb(data);
  }

  /**
   * Create a new ingestion rule
   */
  async createRule(userId: string, input: IngestionRuleInput): Promise<IngestionRule> {
    const { data, error } = await this.supabase
      .from('spring_ingestion_rules')
      .insert({
        user_id: userId,
        name: input.name,
        description: input.description,
        priority: input.priority ?? 100,
        enabled: input.enabled ?? true,
        workspace_id: input.workspaceId,
        namespace: input.namespace,
        agent_id: input.agentId,
        note_types: input.noteTypes,
        categories: input.categories,
        tag_patterns: input.tagPatterns,
        content_patterns: input.contentPatterns,
        confidence_threshold: input.confidenceThreshold ?? 0.75,
        action: input.action,
        redact_replacement: input.redactReplacement,
        metadata: input.metadata,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ingestion rule: ${error.message}`);
    }

    return this.mapRuleFromDb(data);
  }

  /**
   * Update an ingestion rule
   */
  async updateRule(
    ruleId: string,
    input: Partial<IngestionRuleInput>
  ): Promise<IngestionRule> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.workspaceId !== undefined) updates.workspace_id = input.workspaceId;
    if (input.namespace !== undefined) updates.namespace = input.namespace;
    if (input.agentId !== undefined) updates.agent_id = input.agentId;
    if (input.noteTypes !== undefined) updates.note_types = input.noteTypes;
    if (input.categories !== undefined) updates.categories = input.categories;
    if (input.tagPatterns !== undefined) updates.tag_patterns = input.tagPatterns;
    if (input.contentPatterns !== undefined) updates.content_patterns = input.contentPatterns;
    if (input.confidenceThreshold !== undefined) updates.confidence_threshold = input.confidenceThreshold;
    if (input.action !== undefined) updates.action = input.action;
    if (input.redactReplacement !== undefined) updates.redact_replacement = input.redactReplacement;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const { data, error } = await this.supabase
      .from('spring_ingestion_rules')
      .update(updates)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update ingestion rule: ${error.message}`);
    }

    return this.mapRuleFromDb(data);
  }

  /**
   * Delete an ingestion rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    const { error } = await this.supabase
      .from('spring_ingestion_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      throw new Error(`Failed to delete ingestion rule: ${error.message}`);
    }
  }

  // ===========================================================================
  // Ingestion Decision
  // ===========================================================================

  /**
   * Evaluate content against ingestion rules and settings
   * Returns the decision on how to handle the content
   */
  async evaluateIngestion(
    userId: string,
    content: string,
    options: {
      workspaceId?: string;
      namespace?: string;
      agentId?: string;
      noteType?: string;
      categories?: string[];
      extractionConfidence?: number;
    }
  ): Promise<IngestionDecision> {
    // Get settings
    const settings = await this.getSettings(userId);

    // Check if auto-save is disabled
    if (!settings.autoSaveEnabled) {
      return {
        action: 'deny',
        confidence: options.extractionConfidence ?? 1,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: 'Auto-save is disabled',
      };
    }

    // Check blocked categories
    if (options.categories?.some((cat) => settings.blockedCategories.includes(cat))) {
      return {
        action: 'deny',
        confidence: options.extractionConfidence ?? 1,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: `Category blocked: ${options.categories.filter((c) => settings.blockedCategories.includes(c)).join(', ')}`,
      };
    }

    // Check blocked patterns
    const matchedPattern = settings.blockedPatterns.find((pattern) => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(content);
      } catch {
        return false;
      }
    });

    if (matchedPattern) {
      return {
        action: 'deny',
        confidence: options.extractionConfidence ?? 1,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: `Content matches blocked pattern`,
      };
    }

    // Get applicable rules
    const { data: rules } = await this.supabase.rpc('get_applicable_ingestion_rules', {
      p_user_id: userId,
      p_workspace_id: options.workspaceId,
      p_namespace: options.namespace,
      p_agent_id: options.agentId,
      p_note_type: options.noteType,
      p_categories: options.categories,
    });

    // Evaluate rules in priority order
    for (const rule of rules || []) {
      // Check content patterns
      if (rule.content_patterns?.length) {
        const patternMatch = rule.content_patterns.find((pattern: string) => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(content);
          } catch {
            return false;
          }
        });

        if (patternMatch) {
          const action = rule.action as IngestionAction;

          if (action === 'redact') {
            // Redact matching content
            let redactedContent = content;
            for (const pattern of rule.content_patterns) {
              try {
                const regex = new RegExp(pattern, 'gi');
                redactedContent = redactedContent.replace(
                  regex,
                  rule.redact_replacement || '[REDACTED]'
                );
              } catch {
                // Skip invalid regex
              }
            }

            return {
              action: 'store',
              ruleId: rule.id,
              ruleName: rule.name,
              confidence: options.extractionConfidence ?? 1,
              confidenceThreshold: rule.confidence_threshold,
              redactedContent,
              reason: `Content redacted by rule: ${rule.name}`,
            };
          }

          return {
            action,
            ruleId: rule.id,
            ruleName: rule.name,
            confidence: options.extractionConfidence ?? 1,
            confidenceThreshold: rule.confidence_threshold,
            reason: `Matched rule: ${rule.name}`,
          };
        }
      }

      // Check confidence threshold
      if (
        options.extractionConfidence !== undefined &&
        options.extractionConfidence < rule.confidence_threshold
      ) {
        return {
          action: rule.action as IngestionAction,
          ruleId: rule.id,
          ruleName: rule.name,
          confidence: options.extractionConfidence,
          confidenceThreshold: rule.confidence_threshold,
          reason: `Confidence ${options.extractionConfidence} below threshold ${rule.confidence_threshold}`,
        };
      }
    }

    // Check global confidence threshold
    if (
      options.extractionConfidence !== undefined &&
      options.extractionConfidence < settings.defaultConfidenceThreshold
    ) {
      return {
        action: settings.candidateModeEnabled ? 'store_as_candidate' : 'deny',
        confidence: options.extractionConfidence,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: `Confidence ${options.extractionConfidence} below default threshold ${settings.defaultConfidenceThreshold}`,
      };
    }

    // Check if sensitive category -> sensitive capsule
    const isSensitive = options.categories?.some((cat) =>
      settings.sensitiveCategories.includes(cat)
    );

    if (isSensitive && settings.sensitiveCapsuleEnabled) {
      return {
        action: settings.candidateModeEnabled ? 'store_as_candidate' : 'store',
        confidence: options.extractionConfidence ?? 1,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: 'Sensitive category detected - storing in sensitive capsule',
      };
    }

    // Check candidate mode
    if (settings.candidateModeEnabled) {
      return {
        action: 'store_as_candidate',
        confidence: options.extractionConfidence ?? 1,
        confidenceThreshold: settings.defaultConfidenceThreshold,
        reason: 'Candidate mode enabled - storing as candidate for review',
      };
    }

    // Default: allow storage
    return {
      action: 'store',
      confidence: options.extractionConfidence ?? 1,
      confidenceThreshold: settings.defaultConfidenceThreshold,
      reason: 'Passed all ingestion checks',
    };
  }

  /**
   * Redact sensitive content based on patterns
   */
  redactContent(content: string, patterns: string[], replacement = '[REDACTED]'): string {
    let result = content;

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        result = result.replace(regex, replacement);
      } catch {
        // Skip invalid patterns
      }
    }

    return result;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapRuleFromDb(row: Record<string, unknown>): IngestionRule {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      workspaceId: row.workspace_id as string | undefined,
      name: row.name as string,
      description: row.description as string | undefined,
      priority: row.priority as number,
      enabled: row.enabled as boolean,
      namespace: row.namespace as string | undefined,
      agentId: row.agent_id as string | undefined,
      noteTypes: row.note_types as string[] | undefined,
      categories: row.categories as string[] | undefined,
      tagPatterns: row.tag_patterns as string[] | undefined,
      contentPatterns: row.content_patterns as string[] | undefined,
      confidenceThreshold: parseFloat(row.confidence_threshold as string),
      action: row.action as IngestionAction,
      redactReplacement: row.redact_replacement as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createIngestionService(supabase: SupabaseClient): IngestionService {
  return new IngestionService(supabase);
}
