// Seizn Spring - Model Auto Fallback
// Automatically switches to alternative models when quota is exhausted

import { AIModel, MODELS, PLAN_QUOTAS, Plan } from './types';
import { getUserPlan, getDailyUsage } from './db';

// ===========================================
// Model Fallback Priority Chains
// ===========================================
export const MODEL_FALLBACK_CHAINS: Record<string, AIModel[]> = {
  default: [
    'gpt-4o-mini',
    'deepseek-chat',
    'mistral-small-latest',
    'claude-3-5-haiku-20241022',
    'gemini-2.0-flash-exp',
  ],
  quality: [
    'gpt-4o',
    'claude-3-5-sonnet-20241022',
    'gpt-4-turbo',
    'mistral-large-latest',
    'grok-2',
    'gemini-1.5-pro',
    'gpt-4o-mini',
    'deepseek-chat',
  ],
  reasoning: [
    'o1-preview',
    'o1-mini',
    'o3-mini',
    'deepseek-reasoner',
    'claude-opus-4-20250514',
    'claude-3-opus-20240229',
    'gpt-4o',
    'claude-3-5-sonnet-20241022',
  ],
  vision: [
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'grok-2-vision',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp',
    'mistral-large-latest',
  ],
  code: [
    'claude-3-5-sonnet-20241022',
    'codestral-latest',
    'gpt-4o',
    'deepseek-chat',
    'mistral-large-latest',
    'gpt-4o-mini',
  ],
  budget: [
    'deepseek-chat',
    'mistral-small-latest',
    'gpt-4o-mini',
    'claude-3-5-haiku-20241022',
    'gemini-2.0-flash-exp',
    'o3-mini',
  ],
};

// Model to Quota Field Mapping
type NumericQuotaField = 'gpt4o_mini_daily' | 'gpt4o_daily' | 'gpt5_daily' | 'claude_sonnet_daily' | 'claude_opus_daily' | 'gemini_daily';

const MODEL_QUOTA_FIELD: Record<string, NumericQuotaField> = {
  'gpt-4o-mini': 'gpt4o_mini_daily',
  'gpt-4o': 'gpt4o_daily',
  'gpt-4-turbo': 'gpt4o_daily',
  'gpt-5': 'gpt5_daily',
  'o1-preview': 'gpt5_daily',
  'o1-mini': 'gpt5_daily',
  'o3-mini': 'gpt4o_mini_daily',
  'claude-3-5-sonnet-20241022': 'claude_sonnet_daily',
  'claude-3-5-haiku-20241022': 'claude_sonnet_daily',
  'claude-3-opus-20240229': 'claude_opus_daily',
  'claude-opus-4-20250514': 'claude_opus_daily',
  'gemini-2.0-flash-exp': 'gemini_daily',
  'gemini-1.5-pro': 'gemini_daily',
  'deepseek-chat': 'gpt4o_mini_daily',
  'deepseek-reasoner': 'gpt4o_daily',
  'mistral-large-latest': 'gpt4o_daily',
  'mistral-small-latest': 'gpt4o_mini_daily',
  'codestral-latest': 'gpt4o_daily',
  'grok-2': 'gpt4o_daily',
  'grok-2-vision': 'gpt4o_daily',
};

export async function getModelRemainingQuota(
  userId: string,
  model: AIModel
): Promise<{ remaining: number; limit: number }> {
  const plan = (await getUserPlan(userId)) as Plan;
  const quotas = PLAN_QUOTAS[plan] || PLAN_QUOTAS.free;
  const usage = await getDailyUsage(userId);

  const quotaField = MODEL_QUOTA_FIELD[model] || 'gpt4o_mini_daily';
  const limit = quotas[quotaField];

  if (limit === -1) {
    return { remaining: Infinity, limit: -1 };
  }

  let currentUsage = 0;
  if (usage) {
    switch (quotaField) {
      case 'gpt4o_mini_daily':
        currentUsage = usage.gpt4o_mini_count || 0;
        break;
      case 'gpt4o_daily':
        currentUsage = usage.gpt4o_count || 0;
        break;
      case 'gpt5_daily':
        currentUsage = usage.gpt5_count || 0;
        break;
      case 'claude_sonnet_daily':
        currentUsage = usage.claude_sonnet_count || 0;
        break;
      case 'claude_opus_daily':
        currentUsage = usage.claude_opus_count || 0;
        break;
      case 'gemini_daily':
        currentUsage = usage.gemini_count || 0;
        break;
    }
  }

  return {
    remaining: Math.max(0, limit - currentUsage),
    limit,
  };
}

export async function isModelAvailable(
  userId: string,
  model: AIModel
): Promise<boolean> {
  const modelConfig = MODELS[model];
  if (!modelConfig) return false;

  const plan = (await getUserPlan(userId)) as Plan;
  const tierOrder: Record<string, number> = {
    free: 0,
    starter: 1,
    plus: 2,
    pro: 3,
    enterprise: 4,
  };

  const userTier = tierOrder[plan] || 0;
  const modelTier = tierOrder[modelConfig.tier] || 0;

  if (modelTier > userTier) {
    return false;
  }

  const { remaining } = await getModelRemainingQuota(userId, model);
  return remaining > 0;
}

export interface AutoSelectResult {
  model: AIModel;
  reason: 'requested' | 'fallback' | 'quota_exceeded';
  originalModel?: AIModel;
  message?: string;
}

export async function autoSelectModel(
  userId: string,
  options: {
    preferredModel?: AIModel;
    chain?: keyof typeof MODEL_FALLBACK_CHAINS | 'default';
    requireVision?: boolean;
  } = {}
): Promise<AutoSelectResult> {
  const { preferredModel, chain = 'default', requireVision = false } = options;

  if (preferredModel) {
    const available = await isModelAvailable(userId, preferredModel);
    if (available) {
      return { model: preferredModel, reason: 'requested' };
    }
  }

  let fallbackChain = MODEL_FALLBACK_CHAINS[chain] || MODEL_FALLBACK_CHAINS.default;

  if (requireVision) {
    fallbackChain = fallbackChain.filter((m) => MODELS[m]?.supports.vision);
    if (fallbackChain.length === 0) {
      fallbackChain = MODEL_FALLBACK_CHAINS.vision;
    }
  }

  for (const model of fallbackChain) {
    const available = await isModelAvailable(userId, model);
    if (available) {
      if (preferredModel && model !== preferredModel) {
        const originalName = MODELS[preferredModel]?.name || preferredModel;
        const newName = MODELS[model].name;
        return {
          model,
          reason: 'fallback',
          originalModel: preferredModel,
          message: `${originalName} 할당량 소진. ${newName}으로 전환됨.`,
        };
      }
      return { model, reason: 'requested' };
    }
  }

  return {
    model: fallbackChain[0] || 'gpt-4o-mini',
    reason: 'quota_exceeded',
    message: '모든 모델의 일일 할당량이 소진되었습니다.',
  };
}

export async function getAvailableModelsForUser(
  userId: string
): Promise<Array<{ model: AIModel; remaining: number; limit: number }>> {
  const results: Array<{ model: AIModel; remaining: number; limit: number }> = [];

  for (const model of Object.keys(MODELS) as AIModel[]) {
    const available = await isModelAvailable(userId, model);
    if (available) {
      const quota = await getModelRemainingQuota(userId, model);
      results.push({
        model,
        remaining: quota.remaining === Infinity ? -1 : quota.remaining,
        limit: quota.limit,
      });
    }
  }

  return results;
}
