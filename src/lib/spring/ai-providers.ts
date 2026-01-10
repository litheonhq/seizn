// Seizn Spring - AI Provider Integration
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIModel, MODELS } from './types';

// ===========================================
// Provider Clients (Singleton)
// ===========================================
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let googleClient: GoogleGenerativeAI | null = null;
let deepseekClient: OpenAI | null = null;
let mistralClient: OpenAI | null = null;
let xaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

export function getGoogleClient(): GoogleGenerativeAI {
  if (!googleClient) {
    googleClient = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
  }
  return googleClient;
}

export function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return deepseekClient;
}

export function getMistralClient(): OpenAI {
  if (!mistralClient) {
    mistralClient = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: 'https://api.mistral.ai/v1',
    });
  }
  return mistralClient;
}

export function getXAIClient(): OpenAI {
  if (!xaiClient) {
    xaiClient = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    });
  }
  return xaiClient;
}

// Helper to get the right OpenAI-compatible client
function getClientForProvider(provider: string): OpenAI {
  switch (provider) {
    case 'deepseek':
      return getDeepSeekClient();
    case 'mistral':
      return getMistralClient();
    case 'xai':
      return getXAIClient();
    default:
      return getOpenAIClient();
  }
}

// ===========================================
// Unified Chat Interface
// ===========================================
export interface ChatOptions {
  model: AIModel;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  model: AIModel;
}

// ===========================================
// OpenAI Chat
// ===========================================
async function chatOpenAI(options: ChatOptions): Promise<ChatResult> {
  const modelConfig = MODELS[options.model];
  const client = getClientForProvider(modelConfig.provider);

  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  for (const msg of options.messages) {
    messages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    });
  }

  const response = await client.chat.completions.create({
    model: options.model,
    messages,
    max_tokens: options.maxTokens || modelConfig.maxOutputTokens,
    temperature: options.temperature ?? 0.7,
  });

  const choice = response.choices[0];

  return {
    content: choice.message.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    finishReason: choice.finish_reason || 'stop',
    model: options.model,
  };
}

// ===========================================
// OpenAI Streaming
// ===========================================
export async function* streamOpenAI(
  options: ChatOptions
): AsyncGenerator<{ content: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }> {
  const modelConfig = MODELS[options.model];
  const client = getClientForProvider(modelConfig.provider);

  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  for (const msg of options.messages) {
    messages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    });
  }

  const stream = await client.chat.completions.create({
    model: options.model,
    messages,
    max_tokens: options.maxTokens || modelConfig.maxOutputTokens,
    temperature: options.temperature ?? 0.7,
    stream: true,
    stream_options: { include_usage: true },
  });

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    const done = chunk.choices[0]?.finish_reason !== null;

    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }

    if (content || done) {
      yield {
        content,
        done,
        usage: done ? { inputTokens, outputTokens } : undefined,
      };
    }
  }
}

// ===========================================
// Anthropic Chat
// ===========================================
async function chatAnthropic(options: ChatOptions): Promise<ChatResult> {
  const client = getAnthropicClient();
  const modelConfig = MODELS[options.model];

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of options.messages) {
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  const response = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens || modelConfig.maxOutputTokens,
    system: options.systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === 'text');

  return {
    content: textBlock?.type === 'text' ? textBlock.text : '',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    finishReason: response.stop_reason || 'end_turn',
    model: options.model,
  };
}

// ===========================================
// Anthropic Streaming
// ===========================================
export async function* streamAnthropic(
  options: ChatOptions
): AsyncGenerator<{ content: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }> {
  const client = getAnthropicClient();
  const modelConfig = MODELS[options.model];

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of options.messages) {
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  const stream = client.messages.stream({
    model: options.model,
    max_tokens: options.maxTokens || modelConfig.maxOutputTokens,
    system: options.systemPrompt,
    messages,
  });

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { content: event.delta.text, done: false };
    }

    if (event.type === 'message_delta' && event.usage) {
      outputTokens = event.usage.output_tokens;
    }

    if (event.type === 'message_start' && event.message.usage) {
      inputTokens = event.message.usage.input_tokens;
    }

    if (event.type === 'message_stop') {
      yield { content: '', done: true, usage: { inputTokens, outputTokens } };
    }
  }
}

// ===========================================
// Google Chat
// ===========================================
async function chatGoogle(options: ChatOptions): Promise<ChatResult> {
  const client = getGoogleClient();
  const modelConfig = MODELS[options.model];

  const model = client.getGenerativeModel({
    model: options.model,
    systemInstruction: options.systemPrompt,
  });

  const contents = options.messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const result = await model.generateContent({
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || modelConfig.maxOutputTokens,
      temperature: options.temperature ?? 0.7,
    },
  });

  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  return {
    content: text,
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    finishReason: response.candidates?.[0]?.finishReason || 'STOP',
    model: options.model,
  };
}

// ===========================================
// Google Streaming
// ===========================================
export async function* streamGoogle(
  options: ChatOptions
): AsyncGenerator<{ content: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }> {
  const client = getGoogleClient();
  const modelConfig = MODELS[options.model];

  const model = client.getGenerativeModel({
    model: options.model,
    systemInstruction: options.systemPrompt,
  });

  const contents = options.messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const result = await model.generateContentStream({
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || modelConfig.maxOutputTokens,
      temperature: options.temperature ?? 0.7,
    },
  });

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of result.stream) {
    const text = chunk.text();
    const usage = chunk.usageMetadata;

    if (usage) {
      inputTokens = usage.promptTokenCount || 0;
      outputTokens = usage.candidatesTokenCount || 0;
    }

    yield { content: text, done: false };
  }

  yield { content: '', done: true, usage: { inputTokens, outputTokens } };
}

// ===========================================
// Unified Chat Function
// ===========================================
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const modelConfig = MODELS[options.model];

  if (!modelConfig) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  switch (modelConfig.provider) {
    case 'openai':
    case 'deepseek':
    case 'mistral':
    case 'xai':
      return chatOpenAI(options);
    case 'anthropic':
      return chatAnthropic(options);
    case 'google':
      return chatGoogle(options);
    default:
      throw new Error(`Unknown provider: ${modelConfig.provider}`);
  }
}

// ===========================================
// Unified Streaming Function
// ===========================================
export async function* streamChat(
  options: ChatOptions
): AsyncGenerator<{ content: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }> {
  const modelConfig = MODELS[options.model];

  if (!modelConfig) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  switch (modelConfig.provider) {
    case 'openai':
    case 'deepseek':
    case 'mistral':
    case 'xai':
      yield* streamOpenAI(options);
      break;
    case 'anthropic':
      yield* streamAnthropic(options);
      break;
    case 'google':
      yield* streamGoogle(options);
      break;
    default:
      throw new Error(`Unknown provider: ${modelConfig.provider}`);
  }
}

// ===========================================
// Helper: Get available models for plan
// ===========================================
export function getAvailableModels(plan: string): AIModel[] {
  const tierOrder: Record<string, number> = {
    free: 0,
    starter: 1,
    plus: 2,
    pro: 3,
    enterprise: 4,
  };

  const userTier = tierOrder[plan] ?? 0;

  return (Object.entries(MODELS) as [AIModel, typeof MODELS[AIModel]][])
    .filter(([, config]) => tierOrder[config.tier] <= userTier)
    .map(([model]) => model);
}

// ===========================================
// Helper: Calculate cost
// ===========================================
export function calculateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const config = MODELS[model];
  const inputCost = (inputTokens / 1000) * config.inputPricePer1k;
  const outputCost = (outputTokens / 1000) * config.outputPricePer1k;
  return Math.round((inputCost + outputCost) * 100); // Return cents
}
