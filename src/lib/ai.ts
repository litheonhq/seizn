// AI Service Clients for Seizn

// Voyage AI Embedding
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3'; // 1024 dimensions

export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: text,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function createQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: query,
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Anthropic Claude for Memory Extraction
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-sonnet-4-20250514';

  let userMessage = `Extract memories from this conversation:\n\n${conversation}`;

  // Add existing memories context to avoid duplicates
  if (existingMemories.length > 0) {
    userMessage += `\n\n---\nExisting memories (DO NOT duplicate these):\n${existingMemories.slice(0, 10).map(m => `- ${m}`).join('\n')}`;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2048,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-sonnet-4-20250514';

  const systemPrompt = `You are a helpful AI assistant with access to the user's memories. Use these memories to provide personalized, contextually relevant responses.

## User Memories
${memories.map(m => `- ${m}`).join('\n')}

Use these memories naturally in your response when relevant. Don't explicitly mention that you're using stored memories.`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: query },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Token counting estimate (rough)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for Korean
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}
