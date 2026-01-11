// Seizn Spring - Type Definitions

// ===========================================
// AI Models
// ===========================================
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral' | 'xai';

export type AIModel =
  // OpenAI
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'gpt-5'
  // Anthropic
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  // Google
  | 'gemini-2.0-flash-exp'
  | 'gemini-1.5-pro'
  // OpenAI Reasoning
  | 'o1-preview'
  | 'o1-mini'
  | 'o3-mini'
  // Claude Opus 4
  | 'claude-opus-4-20250514'
  // DeepSeek
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  // Mistral
  | 'mistral-large-latest'
  | 'mistral-small-latest'
  | 'codestral-latest'
  // xAI
  | 'grok-2'
  | 'grok-2-vision';

export interface ModelConfig {
  id: AIModel;
  provider: AIProvider;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePer1k: number;   // USD per 1K tokens
  outputPricePer1k: number;
  supports: {
    vision: boolean;
    functionCalling: boolean;
    streaming: boolean;
  };
  tier: 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';
}

export const MODELS: Record<AIModel, ModelConfig> = {
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'Fast and affordable for everyday tasks',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePer1k: 0.00015,
    outputPricePer1k: 0.0006,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'free',
  },
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'Most capable OpenAI model',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePer1k: 0.0025,
    outputPricePer1k: 0.01,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'starter',
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    provider: 'openai',
    name: 'GPT-4 Turbo',
    description: 'Previous generation GPT-4',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.01,
    outputPricePer1k: 0.03,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'plus',
  },
  'gpt-5': {
    id: 'gpt-5',
    provider: 'openai',
    name: 'GPT-5',
    description: 'Next generation reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.015,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'plus',
  },
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'Balanced performance and speed',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.003,
    outputPricePer1k: 0.015,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'starter',
  },
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Haiku',
    description: 'Fast and efficient',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.0008,
    outputPricePer1k: 0.004,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'free',
  },
  'claude-3-opus-20240229': {
    id: 'claude-3-opus-20240229',
    provider: 'anthropic',
    name: 'Claude 3 Opus',
    description: 'Most powerful Claude model',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.075,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'plus',
  },
  'gemini-2.0-flash-exp': {
    id: 'gemini-2.0-flash-exp',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Google latest fast model',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.0,  // Free during preview
    outputPricePer1k: 0.0,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'starter',
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    provider: 'google',
    name: 'Gemini 1.5 Pro',
    description: 'Long context specialist',
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.00125,
    outputPricePer1k: 0.005,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'plus',
  },
  // OpenAI Reasoning Models
  'o1-preview': {
    id: 'o1-preview',
    provider: 'openai',
    name: 'o1 Preview',
    description: 'Advanced reasoning model',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.06,
    supports: { vision: false, functionCalling: false, streaming: true },
    tier: 'plus',
  },
  'o1-mini': {
    id: 'o1-mini',
    provider: 'openai',
    name: 'o1 Mini',
    description: 'Fast reasoning model',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    inputPricePer1k: 0.003,
    outputPricePer1k: 0.012,
    supports: { vision: false, functionCalling: false, streaming: true },
    tier: 'starter',
  },
  'o3-mini': {
    id: 'o3-mini',
    provider: 'openai',
    name: 'o3 Mini',
    description: 'Next-gen compact reasoning',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    inputPricePer1k: 0.0011,
    outputPricePer1k: 0.0044,
    supports: { vision: false, functionCalling: false, streaming: true },
    tier: 'free',
  },
  // Claude Opus 4
  'claude-opus-4-20250514': {
    id: 'claude-opus-4-20250514',
    provider: 'anthropic',
    name: 'Claude Opus 4',
    description: 'Most capable Claude model',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.075,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'pro',
  },
  // DeepSeek
  'deepseek-chat': {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    description: 'Cost-effective high quality model',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.00014,
    outputPricePer1k: 0.00028,
    supports: { vision: false, functionCalling: true, streaming: true },
    tier: 'free',
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek R1',
    description: 'Reasoning specialist',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.00055,
    outputPricePer1k: 0.00219,
    supports: { vision: false, functionCalling: false, streaming: true },
    tier: 'starter',
  },
  // Mistral
  'mistral-large-latest': {
    id: 'mistral-large-latest',
    provider: 'mistral',
    name: 'Mistral Large',
    description: 'Most capable Mistral model',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.006,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'starter',
  },
  'mistral-small-latest': {
    id: 'mistral-small-latest',
    provider: 'mistral',
    name: 'Mistral Small',
    description: 'Fast and efficient',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.0002,
    outputPricePer1k: 0.0006,
    supports: { vision: false, functionCalling: true, streaming: true },
    tier: 'free',
  },
  'codestral-latest': {
    id: 'codestral-latest',
    provider: 'mistral',
    name: 'Codestral',
    description: 'Code generation specialist',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.0003,
    outputPricePer1k: 0.0009,
    supports: { vision: false, functionCalling: false, streaming: true },
    tier: 'starter',
  },
  // xAI
  'grok-2': {
    id: 'grok-2',
    provider: 'xai',
    name: 'Grok 2',
    description: 'xAI flagship model',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.01,
    supports: { vision: false, functionCalling: true, streaming: true },
    tier: 'starter',
  },
  'grok-2-vision': {
    id: 'grok-2-vision',
    provider: 'xai',
    name: 'Grok 2 Vision',
    description: 'Grok with vision capabilities',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.01,
    supports: { vision: true, functionCalling: true, streaming: true },
    tier: 'starter',
  },
};

// ===========================================
// Conversations & Messages
// ===========================================
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  default_model: AIModel;
  system_prompt?: string;
  memory_enabled: boolean;
  memory_namespace?: string;
  message_count: number;
  last_message_at?: string;
  is_shared: boolean;
  share_id?: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: AIModel;
  input_tokens?: number;
  output_tokens?: number;
  attachments?: Attachment[];
  injected_memories?: string[];
  extracted_memories?: string[];
  latency_ms?: number;
  finish_reason?: string;
  created_at: string;
  is_deleted: boolean;
}

export interface Attachment {
  type: 'image' | 'file' | 'audio';
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

// ===========================================
// Chat Request/Response
// ===========================================
export interface ChatRequest {
  conversation_id?: string;        // Create new if not provided
  message: string;
  model?: AIModel;
  attachments?: Attachment[];
  system_prompt?: string;
  memory_enabled?: boolean;
  memory_namespace?: string;
  stream?: boolean;
  mode?: 'default' | 'roleplay';
  character_id?: string;
}

export interface ChatResponse {
  id: string;
  conversation_id: string;
  message: Message;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  injected_memories?: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
}

// ===========================================
// Image Generation
// ===========================================
export type ImageProvider = 'stability' | 'openai';
export type ImageModel = 'sd-xl' | 'sd-3' | 'dall-e-3';

export interface ImageModelConfig {
  id: ImageModel;
  provider: ImageProvider;
  name: string;
  description: string;
  pricePerImage: number;  // USD
  maxWidth: number;
  maxHeight: number;
  supportedAspectRatios: string[];
  supports: {
    negativePrompt: boolean;
    stylePreset: boolean;
    hdQuality: boolean;
  };
  tier: 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';
}

export const IMAGE_MODELS: Record<ImageModel, ImageModelConfig> = {
  'sd-xl': {
    id: 'sd-xl',
    provider: 'stability',
    name: 'Stable Diffusion XL',
    description: 'High quality, cost-effective image generation',
    pricePerImage: 0.002,
    maxWidth: 1024,
    maxHeight: 1024,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supports: { negativePrompt: true, stylePreset: true, hdQuality: false },
    tier: 'free',
  },
  'sd-3': {
    id: 'sd-3',
    provider: 'stability',
    name: 'Stable Diffusion 3',
    description: 'Latest SD model with improved quality',
    pricePerImage: 0.03,
    maxWidth: 1536,
    maxHeight: 1536,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
    supports: { negativePrompt: true, stylePreset: true, hdQuality: false },
    tier: 'starter',
  },
  'dall-e-3': {
    id: 'dall-e-3',
    provider: 'openai',
    name: 'DALL-E 3',
    description: 'Premium quality with natural language understanding',
    pricePerImage: 0.04,  // standard 1024x1024
    maxWidth: 1792,
    maxHeight: 1792,
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supports: { negativePrompt: false, stylePreset: true, hdQuality: true },
    tier: 'starter',
  },
};

// DALL-E 3 detailed pricing
export const DALLE3_PRICING = {
  standard: {
    '1024x1024': 0.04,
    '1024x1792': 0.08,
    '1792x1024': 0.08,
  },
  hd: {
    '1024x1024': 0.08,
    '1024x1792': 0.12,
    '1792x1024': 0.12,
  },
};

export interface ImageGenerationRequest {
  prompt: string;
  negative_prompt?: string;
  model?: ImageModel;
  width?: number;
  height?: number;
  num_images?: number;
  style?: 'vivid' | 'natural' | string;  // DALL-E or SD style preset
  quality?: 'standard' | 'hd';
}

export interface GeneratedImage {
  id: string;
  url: string;
  thumbnail_url?: string;
  prompt: string;
  revised_prompt?: string;  // DALL-E 3 may revise prompts
  model: ImageModel;
  width: number;
  height: number;
  cost_cents: number;
  created_at: string;
}

// ===========================================
// File Analysis
// ===========================================
export interface FileUpload {
  id: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_text?: string;
  analysis_result?: Record<string, unknown>;
  created_at: string;
}

// ===========================================
// Usage & Quotas
// ===========================================
export interface DailyUsage {
  user_id: string;
  usage_date: string;
  gpt4o_mini_count: number;
  gpt4o_count: number;
  gpt5_count: number;
  claude_sonnet_count: number;
  claude_opus_count: number;
  gemini_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  sd_images_count: number;
  dalle_images_count: number;
  video_seconds_used: number;
  files_analyzed_count: number;
  total_cost_cents: number;
}

export interface QuotaCheck {
  allowed: boolean;
  plan: string;
  remaining: number;
  message: string;
}

// ===========================================
// Plans
// ===========================================
export type Plan = 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';

export interface PlanQuota {
  plan: Plan;
  gpt4o_mini_daily: number;
  gpt4o_daily: number;
  gpt5_daily: number;
  claude_sonnet_daily: number;
  claude_opus_daily: number;
  gemini_daily: number;
  sd_images_daily: number;
  dalle_images_daily: number;
  video_seconds_monthly: number;
  files_daily: number;
  max_file_size_mb: number;
  requests_per_minute: number;
}

// Plan quotas (from DCM business plan + Reference Guide)
export const PLAN_QUOTAS: Record<Plan, PlanQuota> = {
  free: {
    plan: 'free',
    gpt4o_mini_daily: 50,
    gpt4o_daily: 0,
    gpt5_daily: 0,
    claude_sonnet_daily: 0,
    claude_opus_daily: 0,
    gemini_daily: 20,
    sd_images_daily: 5,
    dalle_images_daily: 0,
    video_seconds_monthly: 0,
    files_daily: 3,
    max_file_size_mb: 5,
    requests_per_minute: 10,
  },
  starter: {
    plan: 'starter',
    gpt4o_mini_daily: 200,
    gpt4o_daily: 50,
    gpt5_daily: 0,
    claude_sonnet_daily: 50,
    claude_opus_daily: 0,
    gemini_daily: 100,
    sd_images_daily: 30,
    dalle_images_daily: 10,
    video_seconds_monthly: 60,
    files_daily: 20,
    max_file_size_mb: 10,
    requests_per_minute: 30,
  },
  plus: {
    plan: 'plus',
    gpt4o_mini_daily: 500,
    gpt4o_daily: 150,
    gpt5_daily: 20,
    claude_sonnet_daily: 150,
    claude_opus_daily: 20,
    gemini_daily: 300,
    sd_images_daily: 100,
    dalle_images_daily: 30,
    video_seconds_monthly: 300,
    files_daily: 50,
    max_file_size_mb: 25,
    requests_per_minute: 60,
  },
  pro: {
    plan: 'pro',
    gpt4o_mini_daily: 1000,
    gpt4o_daily: 300,
    gpt5_daily: 50,
    claude_sonnet_daily: 300,
    claude_opus_daily: 50,
    gemini_daily: 500,
    sd_images_daily: 300,
    dalle_images_daily: 100,
    video_seconds_monthly: 600,
    files_daily: 100,
    max_file_size_mb: 50,
    requests_per_minute: 120,
  },
  enterprise: {
    plan: 'enterprise',
    gpt4o_mini_daily: -1, // unlimited
    gpt4o_daily: -1,
    gpt5_daily: -1,
    claude_sonnet_daily: -1,
    claude_opus_daily: -1,
    gemini_daily: -1,
    sd_images_daily: -1,
    dalle_images_daily: -1,
    video_seconds_monthly: -1,
    files_daily: -1,
    max_file_size_mb: 100,
    requests_per_minute: -1,
  },
};

// Plan pricing (monthly USD)
export const PLAN_PRICING: Record<Plan, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  starter: { monthly: 9.99, yearly: 99 },
  plus: { monthly: 19.99, yearly: 199 },
  pro: { monthly: 39.99, yearly: 399 },
  enterprise: { monthly: 99.99, yearly: 999 },
};
