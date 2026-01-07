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

interface ExtractedMemory {
  content: string;
  memory_type: 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
  tags: string[];
  confidence: number;
}

export async function extractMemories(
  conversation: string,
  model: 'haiku' | 'sonnet' = 'haiku'
): Promise<ExtractedMemory[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-sonnet-4-20250514';

  const systemPrompt = `You are a memory extraction assistant. Analyze the conversation and extract important facts, preferences, experiences, relationships, or instructions that should be remembered for future context.

Return a JSON array of extracted memories. Each memory should have:
- content: A concise statement of the memory (1-2 sentences)
- memory_type: One of "fact", "preference", "experience", "relationship", "instruction"
- tags: Array of relevant keywords (2-5 tags)
- confidence: How confident you are this is important (0.0-1.0)

Only extract truly important information worth remembering. Quality over quantity.
Return valid JSON only, no markdown.`;

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
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Extract memories from this conversation:\n\n${conversation}`,
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
    return JSON.parse(text);
  } catch {
    console.error('Failed to parse memory extraction:', text);
    return [];
  }
}

// Token counting estimate (rough)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for Korean
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}
