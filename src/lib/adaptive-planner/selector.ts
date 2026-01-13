/**
 * Seizn Adaptive Planner - Plan Selector
 *
 * Selects the best plan for a query based on features,
 * patterns, and historical performance.
 */

import { createServerClient } from '@/lib/supabase';
import { analyzeQuery } from './analyzer';
import type {
  QueryFeatures,
  QueryPlan,
  DefaultQueryPlan,
  PlanMatch,
  PlanConfig,
  QueryPlanRow,
  DefaultQueryPlanRow,
} from './types';
import { rowToQueryPlan, rowToDefaultPlan } from './types';

// ============================================
// Default Plan Config (fallback)
// ============================================

const FALLBACK_PLAN_CONFIG: PlanConfig = {
  topK: 10,
  rerankEnabled: true,
  rerankTopN: 5,
  hybridAlpha: 0.7,
  threshold: 0.55,
  mode: 'hybrid',
};

// ============================================
// Plan Selection
// ============================================

/**
 * Select the best plan for a query
 */
export async function selectPlan(
  query: string,
  features: QueryFeatures,
  options: {
    userId?: string;
    collectionId?: string;
    defaultsOnly?: boolean;
  } = {}
): Promise<PlanMatch> {
  const { userId, collectionId, defaultsOnly = false } = options;

  // If we have a userId and not defaultsOnly, try user plans first
  if (userId && !defaultsOnly) {
    const userPlanMatch = await selectUserPlan(
      query,
      features,
      userId,
      collectionId
    );

    if (userPlanMatch && userPlanMatch.matchScore >= 0.5) {
      return userPlanMatch;
    }
  }

  // Fall back to default plans
  const defaultMatch = await selectDefaultPlan(query, features);

  return defaultMatch;
}

/**
 * Select from user-specific plans
 */
async function selectUserPlan(
  query: string,
  features: QueryFeatures,
  userId: string,
  collectionId?: string
): Promise<PlanMatch | null> {
  const supabase = createServerClient();

  // Fetch active user plans
  let queryBuilder = supabase
    .from('query_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  // Filter by collection if specified
  if (collectionId) {
    queryBuilder = queryBuilder.or(`collection_id.eq.${collectionId},collection_id.is.null`);
  } else {
    queryBuilder = queryBuilder.is('collection_id', null);
  }

  const { data: plans, error } = await queryBuilder;

  if (error || !plans || plans.length === 0) {
    return null;
  }

  // Score each plan
  let bestMatch: PlanMatch | null = null;

  for (const planRow of plans as QueryPlanRow[]) {
    const score = scorePlanMatch(query, features, planRow);

    if (!bestMatch || score.matchScore > bestMatch.matchScore) {
      bestMatch = {
        plan: rowToQueryPlan(planRow),
        matchScore: score.matchScore,
        matchReasons: score.matchReasons,
        isDefault: false,
      };
    }
  }

  return bestMatch;
}

/**
 * Select from default system plans
 */
async function selectDefaultPlan(
  query: string,
  features: QueryFeatures
): Promise<PlanMatch> {
  const supabase = createServerClient();

  const { data: defaults, error } = await supabase
    .from('default_query_plans')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error || !defaults || defaults.length === 0) {
    // Return hardcoded fallback
    return {
      plan: getFallbackPlan(features),
      matchScore: 0,
      matchReasons: ['No plans available, using fallback'],
      isDefault: true,
    };
  }

  // Score each default plan
  let bestMatch: PlanMatch | null = null;

  for (const defaultRow of defaults as DefaultQueryPlanRow[]) {
    const score = scoreDefaultPlanMatch(features, defaultRow);

    if (!bestMatch || score.matchScore > bestMatch.matchScore) {
      bestMatch = {
        plan: rowToDefaultPlan(defaultRow),
        matchScore: score.matchScore,
        matchReasons: score.matchReasons,
        isDefault: true,
      };
    }
  }

  return bestMatch || {
    plan: getFallbackPlan(features),
    matchScore: 0,
    matchReasons: ['No matching plans found'],
    isDefault: true,
  };
}

// ============================================
// Scoring Functions
// ============================================

interface ScoreResult {
  matchScore: number;
  matchReasons: string[];
}

/**
 * Score a user plan against query features
 */
function scorePlanMatch(
  query: string,
  features: QueryFeatures,
  plan: QueryPlanRow
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Priority bonus (normalized to 0-0.3)
  const priorityBonus = Math.min(plan.priority / 100, 1) * 0.3;
  score += priorityBonus;
  if (priorityBonus > 0) {
    reasons.push(`Priority: ${plan.priority}`);
  }

  // Intent match (0.4 points)
  if (plan.query_intents && plan.query_intents.includes(features.intent)) {
    score += 0.4;
    reasons.push(`Intent match: ${features.intent}`);
  }

  // Pattern match (0.3 points)
  if (plan.query_patterns && plan.query_patterns.length > 0) {
    for (const pattern of plan.query_patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(query)) {
          score += 0.3;
          reasons.push(`Pattern match: ${pattern}`);
          break;
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  // Length constraints (0.1 points)
  let lengthMatch = true;
  if (plan.min_query_length && features.length < plan.min_query_length) {
    lengthMatch = false;
    score -= 0.2;
    reasons.push(`Too short (min: ${plan.min_query_length})`);
  }
  if (plan.max_query_length && features.length > plan.max_query_length) {
    lengthMatch = false;
    score -= 0.2;
    reasons.push(`Too long (max: ${plan.max_query_length})`);
  }
  if (lengthMatch) {
    score += 0.1;
    reasons.push('Length in range');
  }

  // Success rate bonus (0.2 points max)
  if (plan.usage_count >= 10) {
    if (plan.success_rate >= 0.8) {
      score += 0.2;
      reasons.push(`High success rate: ${(plan.success_rate * 100).toFixed(0)}%`);
    } else if (plan.success_rate >= 0.6) {
      score += 0.1;
      reasons.push(`Good success rate: ${(plan.success_rate * 100).toFixed(0)}%`);
    } else if (plan.success_rate < 0.4) {
      score -= 0.1;
      reasons.push(`Low success rate: ${(plan.success_rate * 100).toFixed(0)}%`);
    }
  }

  return {
    matchScore: Math.max(0, Math.min(1, score)),
    matchReasons: reasons,
  };
}

/**
 * Score a default plan against query features
 */
function scoreDefaultPlanMatch(
  features: QueryFeatures,
  plan: DefaultQueryPlanRow
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Priority bonus (normalized to 0-0.3)
  const priorityBonus = Math.min(plan.priority / 100, 1) * 0.3;
  score += priorityBonus;

  // Intent match (0.5 points - higher weight for defaults)
  if (plan.query_intents && plan.query_intents.includes(features.intent)) {
    score += 0.5;
    reasons.push(`Intent match: ${features.intent}`);
  }

  // Complexity match (0.2 points)
  if (plan.complexity && plan.complexity === features.complexity) {
    score += 0.2;
    reasons.push(`Complexity match: ${features.complexity}`);
  }

  // Length constraints (0.1 points)
  let lengthMatch = true;
  if (plan.min_query_length && features.length < plan.min_query_length) {
    lengthMatch = false;
    score -= 0.15;
  }
  if (plan.max_query_length && features.length > plan.max_query_length) {
    lengthMatch = false;
    score -= 0.15;
  }
  if (lengthMatch) {
    score += 0.1;
    reasons.push('Length in range');
  }

  // Base match for "default" plan
  if (plan.plan_name === 'default') {
    // Lower score for generic default
    score = Math.max(0.1, score - 0.2);
    reasons.push('Fallback plan');
  }

  return {
    matchScore: Math.max(0, Math.min(1, score)),
    matchReasons: reasons,
  };
}

// ============================================
// Fallback Plan
// ============================================

/**
 * Get a sensible default plan based on query features
 */
export function getDefaultPlan(features: QueryFeatures): PlanConfig {
  // Adjust config based on features
  const config: PlanConfig = { ...FALLBACK_PLAN_CONFIG };

  // Adjust topK based on complexity
  switch (features.complexity) {
    case 'simple':
      config.topK = 5;
      config.rerankTopN = 3;
      break;
    case 'moderate':
      config.topK = 10;
      config.rerankTopN = 5;
      break;
    case 'complex':
      config.topK = 15;
      config.rerankTopN = 8;
      break;
  }

  // Adjust based on intent
  switch (features.intent) {
    case 'factual':
      config.threshold = 0.65;
      config.hybridAlpha = 0.75;
      break;
    case 'exploratory':
      config.threshold = 0.5;
      config.hybridAlpha = 0.6;
      config.topK = Math.min(20, config.topK + 5);
      break;
    case 'comparison':
      config.threshold = 0.45;
      config.hybridAlpha = 0.5;
      config.topK = Math.min(25, config.topK + 10);
      break;
    case 'procedural':
      config.threshold = 0.55;
      config.hybridAlpha = 0.7;
      break;
    case 'opinion':
      config.threshold = 0.5;
      config.hybridAlpha = 0.55;
      break;
  }

  return config;
}

/**
 * Create a fallback plan object
 */
function getFallbackPlan(features: QueryFeatures): DefaultQueryPlan {
  return {
    id: 'fallback',
    planName: 'fallback',
    description: 'Dynamically generated fallback plan',
    planConfig: getDefaultPlan(features),
    queryIntents: [features.intent],
    complexity: features.complexity,
    priority: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

// ============================================
// Plan Selection with Database Function
// ============================================

/**
 * Select plan using the database function (more efficient for production)
 */
export async function selectPlanDb(
  query: string,
  features: QueryFeatures,
  userId: string,
  collectionId?: string
): Promise<PlanMatch> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('find_matching_plan', {
    p_user_id: userId,
    p_collection_id: collectionId || null,
    p_query_text: query,
    p_detected_intent: features.intent,
    p_query_length: features.length,
    p_complexity: features.complexity,
  });

  if (error || !data || data.length === 0) {
    // Fall back to TypeScript-based selection
    return selectPlan(query, features, { userId, collectionId });
  }

  const match = data[0];

  // Fetch the full plan details
  if (match.is_default) {
    const { data: planData } = await supabase
      .from('default_query_plans')
      .select('*')
      .eq('id', match.plan_id)
      .single();

    if (planData) {
      return {
        plan: rowToDefaultPlan(planData as DefaultQueryPlanRow),
        matchScore: match.match_score,
        matchReasons: ['Database match'],
        isDefault: true,
      };
    }
  } else {
    const { data: planData } = await supabase
      .from('query_plans')
      .select('*')
      .eq('id', match.plan_id)
      .single();

    if (planData) {
      return {
        plan: rowToQueryPlan(planData as QueryPlanRow),
        matchScore: match.match_score,
        matchReasons: ['Database match'],
        isDefault: false,
      };
    }
  }

  // Fallback if plan details couldn't be fetched
  return {
    plan: {
      id: match.plan_id,
      planName: match.plan_name,
      planConfig: match.plan_config,
      isActive: true,
      priority: 0,
      createdAt: new Date().toISOString(),
    } as DefaultQueryPlan,
    matchScore: match.match_score,
    matchReasons: ['Database match (partial)'],
    isDefault: match.is_default,
  };
}

// ============================================
// Combined Selection Function
// ============================================

/**
 * Main entry point for plan selection
 * Analyzes query and selects the best plan
 */
export async function selectPlanForQuery(
  query: string,
  options: {
    userId?: string;
    collectionId?: string;
    defaultsOnly?: boolean;
    useDbFunction?: boolean;
  } = {}
): Promise<{
  plan: QueryPlan | DefaultQueryPlan;
  features: QueryFeatures;
  matchScore: number;
  matchReasons: string[];
  isDefault: boolean;
}> {
  // Analyze the query
  const features = await analyzeQuery(query);

  // Select the best plan
  let match: PlanMatch;

  if (options.useDbFunction && options.userId) {
    match = await selectPlanDb(
      query,
      features,
      options.userId,
      options.collectionId
    );
  } else {
    match = await selectPlan(query, features, {
      userId: options.userId,
      collectionId: options.collectionId,
      defaultsOnly: options.defaultsOnly,
    });
  }

  return {
    plan: match.plan,
    features,
    matchScore: match.matchScore,
    matchReasons: match.matchReasons,
    isDefault: match.isDefault,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get all plans for a user
 */
export async function getUserPlans(
  userId: string,
  collectionId?: string
): Promise<QueryPlan[]> {
  const supabase = createServerClient();

  let queryBuilder = supabase
    .from('query_plans')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false });

  if (collectionId) {
    queryBuilder = queryBuilder.or(`collection_id.eq.${collectionId},collection_id.is.null`);
  }

  const { data, error } = await queryBuilder;

  if (error || !data) {
    return [];
  }

  return (data as QueryPlanRow[]).map(rowToQueryPlan);
}

/**
 * Get all default plans
 */
export async function getDefaultPlans(): Promise<DefaultQueryPlan[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('default_query_plans')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as DefaultQueryPlanRow[]).map(rowToDefaultPlan);
}
