// AI Service Clients for Seizn

import { getCachedEmbedding, setCachedEmbedding } from './redis';
import {
  buildAnthropicHeaders,
  buildCachedSystemPrompt,
} from './anthropic/prompt-caching';
import { getSanitizedEnv } from './env';
import { getReplayCapture } from './replay/capture';
import {
  recordToolCall as recordReplayToolCall,
  resolveReplayToolStub,
} from './replay/tool-stub';

// Voyage AI Embedding
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3'; // 1024 dimensions

// Internal function to call Voyage API
async function callVoyageAPI(text: string, inputType: 'document' | 'query'): Promise<number[]> {
  const toolName = `embedding.voyage.${VOYAGE_MODEL}`;
  const toolInput = {
    model: VOYAGE_MODEL,
    input: text,
    input_type: inputType,
  };
  const replayOutput = resolveReplayToolStub<number[]>(toolName, toolInput);
  if (replayOutput !== undefined) {
    return replayOutput;
  }

  const apiKey = getSanitizedEnv('VOYAGE_API_KEY');
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const startedAt = Date.now();
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(toolInput),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${error}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;
  recordReplayToolCall(getReplayCapture()?.traceId, {
    name: toolName,
    input: toolInput,
    output: embedding,
    latencyMs: Date.now() - startedAt,
  });
  return embedding;
}

export async function createEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cached = await getCachedEmbedding(text, 'document');
  if (cached) {
    return cached;
  }

  // Call API
  const embedding = await callVoyageAPI(text, 'document');

  // Cache for future use (non-blocking)
  setCachedEmbedding(text, 'document', embedding).catch(console.error);

  return embedding;
}

export async function createQueryEmbedding(query: string): Promise<number[]> {
  // Check cache first
  const cached = await getCachedEmbedding(query, 'query');
  if (cached) {
    return cached;
  }

  // Call API
  const embedding = await callVoyageAPI(query, 'query');

  // Cache for future use (non-blocking)
  setCachedEmbedding(query, 'query', embedding).catch(console.error);

  return embedding;
}

// Anthropic Claude for Memory Extraction
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

type AnthropicMessagesPayload = {
  model: string;
  max_tokens: number;
  system?: unknown;
  messages: unknown[];
};

type AnthropicMessagesResponse = {
  content: Array<{ text: string }>;
};

async function callAnthropicMessages(
  payload: AnthropicMessagesPayload
): Promise<AnthropicMessagesResponse> {
  const toolName = `llm.anthropic.${payload.model}`;
  const replayOutput = resolveReplayToolStub<AnthropicMessagesResponse>(toolName, payload);
  if (replayOutput !== undefined) {
    return replayOutput;
  }

  const apiKey = getSanitizedEnv('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const startedAt = Date.now();
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  recordReplayToolCall(getReplayCapture()?.traceId, {
    name: toolName,
    input: payload,
    output: data,
    latencyMs: Date.now() - startedAt,
  });
  return data;
}

export interface ExtractedMemory {
  content: string;
  memory_type: 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
  tags: string[];
  confidence: number;
  importance: number;
}

interface ExtractionOptions {
  model?: 'haiku' | 'sonnet';
  existingMemories?: string[];
  language?: 'en' | 'ko' | 'auto';
}

const EXTRACTION_PROMPT = `You are an expert memory extraction system. Your task is to identify and extract important information from conversations that should be remembered for future context.

## Memory Types
- **fact**: Objective information about the user (name, job, location, technical skills, etc.)
- **preference**: User's likes, dislikes, preferences, opinions
- **experience**: Past experiences, events, achievements, challenges
- **relationship**: Information about people the user knows (colleagues, family, friends)
- **instruction**: Specific instructions or requests for how to behave/respond

## Extraction Rules
1. Extract ONLY genuinely important information worth long-term storage
2. Be concise: each memory should be 1-2 sentences max
3. Use third person ("The user..." or "User prefers...")
4. Avoid extracting temporary/session-specific information
5. Prioritize unique, actionable insights
6. Skip small talk and greetings
7. Confidence should reflect how certain the information is (0.0-1.0)
8. Importance should reflect how useful this memory will be (1-10)

## Output Format
Return a JSON array only. No markdown, no explanation.
Each object: { "content": string, "memory_type": string, "tags": string[], "confidence": number, "importance": number }

If nothing important to extract, return empty array: []`;

export async function extractMemories(
  conversation: string,
  options: ExtractionOptions = {}
): Promise<ExtractedMemory[]> {
  const { model = 'haiku', existingMemories = [] } = options;

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  let userMessage = `Extract memories from this conversation:\n\n${conversation}`;

  // Add existing memories context to avoid duplicates
  if (existingMemories.length > 0) {
    userMessage += `\n\n---\nExisting memories (DO NOT duplicate these):\n${existingMemories.slice(0, 10).map(m => `- ${m}`).join('\n')}`;
  }

  const data = await callAnthropicMessages({
    model: modelId,
    max_tokens: 2048,
    system: buildCachedSystemPrompt(EXTRACTION_PROMPT),
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });
  const text = data.content[0].text;

  try {
    const memories = JSON.parse(text);
    // Validate and normalize
    return memories.map((m: ExtractedMemory) => ({
      content: m.content,
      memory_type: m.memory_type || 'fact',
      tags: Array.isArray(m.tags) ? m.tags : [],
      confidence: Math.min(1, Math.max(0, m.confidence || 0.8)),
      importance: Math.min(10, Math.max(1, m.importance || 5)),
    }));
  } catch {
    console.error('Failed to parse memory extraction:', text);
    return [];
  }
}

// Generate a contextual response using relevant memories
export async function generateWithMemories(
  query: string,
  memories: string[],
  model: 'haiku' | 'sonnet' = 'haiku'
): Promise<string> {
  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  const systemPrompt = `You are a helpful AI assistant with access to the user's memories. Use these memories to provide personalized, contextually relevant responses.

## User Memories
${memories.map(m => `- ${m}`).join('\n')}

Use these memories naturally in your response when relevant. Don't explicitly mention that you're using stored memories.`;

  const data = await callAnthropicMessages({
    model: modelId,
    max_tokens: 1024,
    system: buildCachedSystemPrompt(systemPrompt),
    messages: [
      { role: 'user', content: query },
    ],
  });
  return data.content[0].text;
}

// ==================== Vision / Multimodal ====================

const IMAGE_EXTRACTION_PROMPT = `You are an expert at extracting information from images for long-term memory storage.

## Your Task
Analyze the provided image and extract any important information that should be remembered for future context.

## Memory Types
- **fact**: Objective information visible in the image (text, numbers, diagrams, settings)
- **preference**: Preferences or choices shown (UI settings, configurations, selected options)
- **experience**: Events, activities, or achievements depicted
- **relationship**: People or connections shown
- **instruction**: Instructions, tutorials, or how-to information visible

## Extraction Rules
1. Extract ONLY genuinely important information worth storing
2. Be specific and accurate about what you see
3. Use third person ("The user has...", "The image shows...")
4. Include relevant text visible in the image
5. Note important visual elements (charts, graphs, code, UI)
6. Confidence reflects certainty of your interpretation
7. Importance reflects how useful this memory will be

## Output Format
Return a JSON array only. No markdown, no explanation.
Each object: { "content": string, "memory_type": string, "tags": string[], "confidence": number, "importance": number }

If nothing important to extract, return empty array: []`;

interface ImageExtractionOptions {
  model?: 'haiku' | 'sonnet';
  context?: string; // Additional context about the image
  existingMemories?: string[];
}

const MAX_IMAGE_BASE64_LENGTH = 7_000_000; // ~5MB after base64 encoding
type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string };
type VisionContentItem = { type: 'image'; source: ImageSource } | { type: 'text'; text: string };

/** Block SSRF: reject private/internal IPs and non-HTTPS URLs */
function validateImageUrl(urlString: string): void {
  const url = new URL(urlString); // throws on invalid
  if (url.protocol !== 'https:') throw new Error('Only HTTPS image URLs allowed');
  const host = url.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'];
  if (blocked.includes(host)) throw new Error('URL hostname not allowed');
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new Error('Private IP addresses not allowed');
  }
}

export async function extractMemoriesFromImage(
  imageData: string, // Base64 encoded image or URL
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  options: ImageExtractionOptions = {}
): Promise<ExtractedMemory[]> {
  const { model = 'sonnet', context, existingMemories = [] } = options;

  // Use Sonnet for vision tasks (better quality)
  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Build content array with image (SSRF-safe)
  let imageSource: ImageSource;
  if (imageData.startsWith('http')) {
    validateImageUrl(imageData);
    imageSource = { type: 'url', url: imageData };
  } else {
    if (imageData.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new Error(`Image too large (max ~5MB). Got ${Math.round(imageData.length / 1_000_000)}MB`);
    }
    imageSource = { type: 'base64', media_type: mediaType, data: imageData };
  }
  const content: VisionContentItem[] = [{ type: 'image', source: imageSource }];

  // Add context if provided
  let textContent = 'Extract any important memories from this image.';
  if (context) {
    textContent += `\n\nContext: ${context}`;
  }
  if (existingMemories.length > 0) {
    textContent += `\n\n---\nExisting memories (DO NOT duplicate these):\n${existingMemories.slice(0, 10).map(m => `- ${m}`).join('\n')}`;
  }

  content.push({ type: 'text', text: textContent });

  const data = await callAnthropicMessages({
    model: modelId,
    max_tokens: 2048,
    system: buildCachedSystemPrompt(IMAGE_EXTRACTION_PROMPT),
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });
  const text = data.content[0].text;

  try {
    const memories = JSON.parse(text);
    // Validate and normalize
    return memories.map((m: ExtractedMemory) => ({
      content: m.content,
      memory_type: m.memory_type || 'fact',
      tags: Array.isArray(m.tags) ? m.tags : [],
      confidence: Math.min(1, Math.max(0, m.confidence || 0.8)),
      importance: Math.min(10, Math.max(1, m.importance || 5)),
    }));
  } catch {
    console.error('Failed to parse image memory extraction:', text);
    return [];
  }
}

// Describe an image for text embedding
export async function describeImageForEmbedding(
  imageData: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
): Promise<string> {
  const data = await callAnthropicMessages({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: imageData.startsWith('http')
              ? { type: 'url', url: imageData }
              : { type: 'base64', media_type: mediaType, data: imageData },
          },
          {
            type: 'text',
            text: 'Describe this image in 2-3 sentences for indexing purposes. Focus on the main content, any text visible, and key visual elements.',
          },
        ],
      },
    ],
  });
  return data.content[0].text;
}

// Token counting estimate (rough)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for Korean
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}

// Conversation Message type
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Conversation Summary result
export interface ConversationSummary {
  summary: string;
  key_points: string[];
  extracted_memories: ExtractedMemory[];
  topic: string;
  message_count: number;
  time_range?: { start: string; end: string };
}

const SUMMARIZATION_PROMPT = `You are an expert conversation summarizer. Your task is to analyze conversations and create concise, actionable summaries.

## Output Format
Return a JSON object with:
- "summary": A 2-4 sentence overview of the conversation
- "key_points": Array of 3-7 bullet points capturing main discussion items
- "extracted_memories": Array of important facts to remember (same format as memory extraction)
- "topic": A short topic label (2-5 words)

## Guidelines
1. Focus on decisions made, tasks discussed, and important information shared
2. Ignore greetings, small talk, and filler content
3. Preserve technical details, names, dates, and specific numbers
4. Extract memories that would be useful in future conversations
5. Be language-aware: maintain the original language for proper nouns and technical terms

Return only valid JSON, no markdown.`;

export async function summarizeConversation(
  messages: ConversationMessage[],
  options: { model?: 'haiku' | 'sonnet'; existingMemories?: string[] } = {}
): Promise<ConversationSummary> {
  const { model = 'haiku', existingMemories = [] } = options;

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Format conversation for summarization
  const conversationText = messages
    .map((m) => `[${m.role.toUpperCase()}]${m.timestamp ? ` (${m.timestamp})` : ''}: ${m.content}`)
    .join('\n\n');

  let userMessage = `Summarize this conversation:\n\n${conversationText}`;

  // Add existing memories to avoid duplicate extraction
  if (existingMemories.length > 0) {
    userMessage += `\n\n---\nExisting memories (avoid duplicating):\n${existingMemories.slice(0, 10).map(m => `- ${m}`).join('\n')}`;
  }

  const data = await callAnthropicMessages({
    model: modelId,
    max_tokens: 2048,
    system: buildCachedSystemPrompt(SUMMARIZATION_PROMPT),
    messages: [
      { role: 'user', content: userMessage },
    ],
  });
  const text = data.content[0].text;

  try {
    const result = JSON.parse(text);

    // Calculate time range from timestamps if available
    const timestamps = messages
      .filter(m => m.timestamp)
      .map(m => m.timestamp as string)
      .sort();

    return {
      summary: result.summary || '',
      key_points: Array.isArray(result.key_points) ? result.key_points : [],
      extracted_memories: (result.extracted_memories || []).map((m: ExtractedMemory) => ({
        content: m.content,
        memory_type: m.memory_type || 'fact',
        tags: Array.isArray(m.tags) ? m.tags : [],
        confidence: Math.min(1, Math.max(0, m.confidence || 0.8)),
        importance: Math.min(10, Math.max(1, m.importance || 5)),
      })),
      topic: result.topic || 'General Conversation',
      message_count: messages.length,
      time_range: timestamps.length >= 2
        ? { start: timestamps[0], end: timestamps[timestamps.length - 1] }
        : undefined,
    };
  } catch {
    console.error('Failed to parse summarization result:', text);
    return {
      summary: 'Failed to generate summary',
      key_points: [],
      extracted_memories: [],
      topic: 'Unknown',
      message_count: messages.length,
    };
  }
}
