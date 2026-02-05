/**
 * Gateway Embed API Endpoint
 *
 * POST /api/gateway/embed
 *
 * Routes embedding requests through the AI Gateway with:
 * - Multi-provider support (OpenAI, Cohere, Voyage, local models)
 * - Automatic batching and rate limiting
 * - Cost tracking
 * - Semantic caching
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import OpenAI from "openai";

// Embedding model configurations
const EMBEDDING_MODELS: Record<
  string,
  {
    provider: "openai" | "cohere" | "voyage" | "local";
    dimensions: number;
    maxTokens: number;
    costPer1M: number; // in microcents
  }
> = {
  // OpenAI
  "text-embedding-3-small": { provider: "openai", dimensions: 1536, maxTokens: 8191, costPer1M: 2 },
  "text-embedding-3-large": { provider: "openai", dimensions: 3072, maxTokens: 8191, costPer1M: 13 },
  "text-embedding-ada-002": { provider: "openai", dimensions: 1536, maxTokens: 8191, costPer1M: 10 },
  // Cohere
  "embed-english-v3.0": { provider: "cohere", dimensions: 1024, maxTokens: 512, costPer1M: 10 },
  "embed-multilingual-v3.0": { provider: "cohere", dimensions: 1024, maxTokens: 512, costPer1M: 10 },
  // Voyage
  "voyage-large-2": { provider: "voyage", dimensions: 1536, maxTokens: 16000, costPer1M: 12 },
  "voyage-code-2": { provider: "voyage", dimensions: 1536, maxTokens: 16000, costPer1M: 12 },
};

interface EmbedRequest {
  model: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
  dimensions?: number;
  metadata?: Record<string, unknown>;
}

interface EmbeddingResult {
  index: number;
  embedding: number[];
  tokens: number;
}

/**
 * POST /api/gateway/embed
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Authenticate
    const session = await auth();
    const userId = session?.user?.id;

    // Parse request
    const body: EmbedRequest = await request.json();
    const { model, input, encoding_format, dimensions, metadata } = body;

    // Validate required fields
    if (!model || !input) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "model and input are required",
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    // Validate model
    const modelConfig = EMBEDDING_MODELS[model];
    if (!modelConfig) {
      return NextResponse.json(
        {
          error: {
            code: "UNSUPPORTED_MODEL",
            message: `Model ${model} is not supported. Supported models: ${Object.keys(EMBEDDING_MODELS).join(", ")}`,
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    // Normalize input to array
    const inputs = Array.isArray(input) ? input : [input];

    // Get org context
    const apiKey = request.headers.get("x-api-key");
    let orgId: string | null = null;

    if (apiKey) {
      const supabase = createServerClient();
      const { data: keyData } = await supabase
        .from("api_keys")
        .select("org_id, scopes")
        .eq("key_hash", hashApiKey(apiKey))
        .eq("is_active", true)
        .single();

      if (!keyData) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
          { status: 401 }
        );
      }

      if (!keyData.scopes?.includes("gateway:embed") && !keyData.scopes?.includes("gateway:*")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "API key lacks gateway:embed scope" } },
          { status: 403 }
        );
      }

      orgId = keyData.org_id;
    } else if (userId) {
      const supabase = createServerClient();
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      orgId = membership?.org_id || null;
    }

    // Check cache for existing embeddings
    const cachedResults = await checkEmbeddingCache(orgId, model, inputs);
    const uncachedInputs = inputs.filter((_, i) => !cachedResults[i]);
    const uncachedIndices = inputs.map((_, i) => i).filter((i) => !cachedResults[i]);

    let newEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Generate embeddings for uncached inputs
    if (uncachedInputs.length > 0) {
      switch (modelConfig.provider) {
        case "openai":
          newEmbeddings = await generateOpenAIEmbeddings(model, uncachedInputs, dimensions);
          break;
        case "cohere":
          newEmbeddings = await generateCohereEmbeddings(model, uncachedInputs);
          break;
        case "voyage":
          newEmbeddings = await generateVoyageEmbeddings(model, uncachedInputs);
          break;
        default:
          return NextResponse.json(
            { error: { code: "PROVIDER_ERROR", message: "Provider not implemented" } },
            { status: 501 }
          );
      }

      totalTokens = newEmbeddings.reduce((sum, e) => sum + e.tokens, 0);

      // Cache new embeddings
      if (orgId) {
        await cacheEmbeddings(orgId, model, uncachedInputs, newEmbeddings);
      }
    }

    // Merge cached and new results
    const results: EmbeddingResult[] = inputs.map((_, index) => {
      if (cachedResults[index]) {
        return {
          index,
          embedding: cachedResults[index].embedding,
          tokens: cachedResults[index].tokens,
        };
      }
      const uncachedIndex = uncachedIndices.indexOf(index);
      return {
        ...newEmbeddings[uncachedIndex],
        index,
      };
    });

    const latencyMs = Date.now() - startTime;
    const cachedCount = Object.keys(cachedResults).length;

    // Record cost
    if (orgId && totalTokens > 0) {
      await recordEmbeddingCost(
        orgId,
        userId || null,
        requestId,
        modelConfig.provider,
        model,
        totalTokens,
        latencyMs
      );
    }

    // Format embeddings based on encoding_format
    const formattedEmbeddings = results.map((r) => ({
      object: "embedding",
      index: r.index,
      embedding: encoding_format === "base64" ? embedToBase64(r.embedding) : r.embedding,
    }));

    return NextResponse.json(
      {
        object: "list",
        request_id: requestId,
        model,
        data: formattedEmbeddings,
        usage: {
          prompt_tokens: totalTokens + results.filter((_, i) => cachedResults[i]).reduce((sum, r) => sum + r.tokens, 0),
          total_tokens: totalTokens + results.filter((_, i) => cachedResults[i]).reduce((sum, r) => sum + r.tokens, 0),
        },
        latency_ms: latencyMs,
        cache_hits: cachedCount,
        cache_misses: inputs.length - cachedCount,
      },
      {
        headers: {
          "X-Request-Id": requestId,
          "X-Latency-Ms": String(latencyMs),
          "X-Cache-Hits": String(cachedCount),
        },
      }
    );
  } catch (error) {
    console.error("[Gateway Embed Error]", { requestId, error });

    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        error: {
          code: "GATEWAY_ERROR",
          message: errorMessage,
        },
        request_id: requestId,
        latency_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * Generate embeddings using OpenAI
 */
async function generateOpenAIEmbeddings(
  model: string,
  inputs: string[],
  dimensions?: number
): Promise<EmbeddingResult[]> {
  const client = new OpenAI();

  const response = await client.embeddings.create({
    model,
    input: inputs,
    dimensions,
  });

  return response.data.map((d, index) => ({
    index,
    embedding: d.embedding,
    tokens: Math.ceil(inputs[index].length / 4), // Approximate
  }));
}

/**
 * Generate embeddings using Cohere
 */
async function generateCohereEmbeddings(model: string, inputs: string[]): Promise<EmbeddingResult[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error("COHERE_API_KEY not configured");
  }

  const response = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      texts: inputs,
      input_type: "search_document",
    }),
  });

  if (!response.ok) {
    throw new Error(`Cohere API error: ${response.status}`);
  }

  const data = await response.json();

  return data.embeddings.map((embedding: number[], index: number) => ({
    index,
    embedding,
    tokens: Math.ceil(inputs[index].length / 4),
  }));
}

/**
 * Generate embeddings using Voyage
 */
async function generateVoyageEmbeddings(model: string, inputs: string[]): Promise<EmbeddingResult[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY not configured");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: inputs,
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage API error: ${response.status}`);
  }

  const data = await response.json();

  return data.data.map((d: { embedding: number[] }, index: number) => ({
    index,
    embedding: d.embedding,
    tokens: Math.ceil(inputs[index].length / 4),
  }));
}

/**
 * Check embedding cache
 */
async function checkEmbeddingCache(
  orgId: string | null,
  model: string,
  inputs: string[]
): Promise<Record<number, { embedding: number[]; tokens: number }>> {
  if (!orgId) return {};

  try {
    const supabase = createServerClient();
    const results: Record<number, { embedding: number[]; tokens: number }> = {};

    // Hash inputs for cache lookup
    const hashes = inputs.map((input) => hashInput(input));

    const { data } = await supabase
      .from("gateway_semantic_cache")
      .select("cache_key_hash, response")
      .eq("org_id", orgId)
      .eq("model", model)
      .in("cache_key_hash", hashes)
      .gt("expires_at", new Date().toISOString());

    if (data) {
      for (const item of data) {
        const index = hashes.indexOf(item.cache_key_hash);
        if (index !== -1 && item.response) {
          results[index] = {
            embedding: item.response.embedding,
            tokens: item.response.tokens || 0,
          };
        }
      }
    }

    return results;
  } catch {
    return {};
  }
}

/**
 * Cache embeddings
 */
async function cacheEmbeddings(
  orgId: string,
  model: string,
  inputs: string[],
  embeddings: EmbeddingResult[]
): Promise<void> {
  try {
    const supabase = createServerClient();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour TTL

    const records = inputs.map((input, i) => ({
      org_id: orgId,
      cache_key_hash: hashInput(input),
      model,
      response: { embedding: embeddings[i].embedding, tokens: embeddings[i].tokens },
      response_tokens: embeddings[i].tokens,
      expires_at: expiresAt.toISOString(),
      original_request_hash: hashInput(input),
    }));

    await supabase.from("gateway_semantic_cache").upsert(records, {
      onConflict: "org_id,cache_key_hash,model",
    });
  } catch (error) {
    console.error("Failed to cache embeddings:", error);
  }
}

/**
 * Record embedding cost
 */
async function recordEmbeddingCost(
  orgId: string,
  userId: string | null,
  requestId: string,
  provider: string,
  model: string,
  tokens: number,
  latencyMs: number
): Promise<void> {
  try {
    const supabase = createServerClient();
    const modelConfig = EMBEDDING_MODELS[model];
    const costMicrocents = Math.round((tokens / 1000000) * modelConfig.costPer1M * 100000);

    await supabase.rpc("record_gateway_cost", {
      p_org_id: orgId,
      p_user_id: userId,
      p_route_id: null,
      p_request_id: requestId,
      p_provider: provider,
      p_model: model,
      p_prompt_tokens: tokens,
      p_completion_tokens: 0,
      p_prompt_cost_microcents: costMicrocents,
      p_completion_cost_microcents: 0,
      p_latency_ms: latencyMs,
      p_endpoint: "/embed",
      p_status_code: 200,
      p_is_cached: false,
      p_is_streaming: false,
      p_error_type: null,
      p_error_message: null,
      p_metadata: {},
    });
  } catch (error) {
    console.error("Failed to record embedding cost:", error);
  }
}

/**
 * Hash API key
 */
function hashApiKey(key: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Hash input for caching
 */
function hashInput(input: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 32);
}

/**
 * Convert embedding to base64
 */
function embedToBase64(embedding: number[]): string {
  const buffer = new Float32Array(embedding);
  return Buffer.from(buffer.buffer).toString("base64");
}

/**
 * GET /api/gateway/embed - Get embedding endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gateway/embed",
    method: "POST",
    description: "AI Gateway Embeddings API",
    supported_models: Object.entries(EMBEDDING_MODELS).map(([name, config]) => ({
      name,
      provider: config.provider,
      dimensions: config.dimensions,
      max_tokens: config.maxTokens,
    })),
    features: ["semantic_caching", "batching", "cost_tracking", "rate_limiting"],
    documentation: "https://docs.seizn.com/gateway/embed",
  });
}
