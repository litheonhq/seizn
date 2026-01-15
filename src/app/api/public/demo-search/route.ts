/**
 * Public Demo Search API
 *
 * No authentication required - for landing page demo.
 * Rate limited by IP (max 5 requests/minute).
 * Uses fixed sample dataset with caching.
 *
 * POST /api/public/demo-search
 */

import { NextRequest, NextResponse } from "next/server";
import demoDataset from "@/data/demo-dataset.json";

// =============================================================================
// Types
// =============================================================================

interface DemoDocument {
  id: string;
  title: string;
  content: string;
  metadata: {
    source: string;
    section: string;
    tags: string[];
  };
}

interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  rerankScore?: number;
  metadata: DemoDocument["metadata"];
}

interface TraceStep {
  name: string;
  stage: "embed" | "search" | "rerank" | "generate" | "validate";
  startMs: number;
  endMs: number;
  model?: string;
  inputSize?: number;
  outputSize?: number;
  cached?: boolean;
  cost?: number;
  details?: Record<string, unknown>;
}

interface TraceSummary {
  totalLatencyMs: number;
  totalCost: number;
  tokensUsed: number;
  vectorOps: number;
  steps: TraceStep[];
}

interface CostBreakdown {
  embedding: number;
  vectorSearch: number;
  rerank: number;
  answerContract: number;
  total: number;
  tokensIn: number;
  tokensOut: number;
  queryUnits: number;
}

interface DemoSearchRequest {
  query: string;
  topK?: number;
  hybridSearch?: boolean;
  rerank?: boolean;
  answerContract?: boolean;
  budgetMs?: number;
}

interface DemoSearchResponse {
  traceId: string;
  results: SearchResult[];
  trace: TraceSummary;
  cost: CostBreakdown;
  cached: boolean;
}

// =============================================================================
// IP-Based Rate Limiting (5 req/min)
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEMO_RATE_LIMIT = 5; // 5 requests per minute
const DEMO_WINDOW_MS = 60 * 1000; // 1 minute window

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkDemoRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `demo:${ip}`;

  // Cleanup old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + DEMO_WINDOW_MS });
    return { allowed: true, remaining: DEMO_RATE_LIMIT - 1, resetAt: now + DEMO_WINDOW_MS };
  }

  if (entry.count >= DEMO_RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: DEMO_RATE_LIMIT - entry.count, resetAt: entry.resetAt };
}

// =============================================================================
// Query Caching
// =============================================================================

interface CacheEntry {
  response: DemoSearchResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const queryCache = new Map<string, CacheEntry>();

function getCacheKey(query: string, options: Partial<DemoSearchRequest>): string {
  return JSON.stringify({
    query: query.toLowerCase().trim(),
    topK: options.topK || 5,
    hybridSearch: options.hybridSearch ?? true,
    rerank: options.rerank ?? true,
    answerContract: options.answerContract ?? false,
  });
}

function getCachedResponse(key: string): DemoSearchResponse | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    queryCache.delete(key);
    return null;
  }
  return { ...entry.response, cached: true };
}

function setCachedResponse(key: string, response: DemoSearchResponse): void {
  // Limit cache size
  if (queryCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of queryCache.entries()) {
      if (v.expiresAt < now) queryCache.delete(k);
    }
    // If still too large, delete oldest entries
    if (queryCache.size > 800) {
      const keys = Array.from(queryCache.keys()).slice(0, 200);
      keys.forEach((k) => queryCache.delete(k));
    }
  }

  queryCache.set(key, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// =============================================================================
// Demo Search Logic
// =============================================================================

/**
 * Simple keyword-based relevance scoring
 * In production, this would use actual embeddings
 */
function calculateRelevance(query: string, doc: DemoDocument): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  const tags = doc.metadata.tags.join(" ").toLowerCase();

  let score = 0;
  let matches = 0;

  for (const term of queryTerms) {
    if (titleLower.includes(term)) {
      score += 0.3;
      matches++;
    }
    if (contentLower.includes(term)) {
      score += 0.2;
      matches++;
    }
    if (tags.includes(term)) {
      score += 0.15;
      matches++;
    }
  }

  // Base relevance score (simulates vector similarity)
  const baseScore = matches > 0 ? 0.5 + score : Math.random() * 0.3 + 0.3;

  // Normalize to 0-1 range
  return Math.min(1, baseScore);
}

/**
 * Simulate reranking with cross-encoder
 * In production, this would call an actual reranking model
 */
function simulateRerank(results: SearchResult[], query: string): SearchResult[] {
  return results.map((r) => {
    // Simulate rerank score adjustment
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = r.content.toLowerCase();

    let boost = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) boost += 0.02;
    }

    // Rerank score is typically more precise
    const rerankScore = Math.min(0.99, r.score + boost + (Math.random() * 0.1 - 0.05));

    return { ...r, rerankScore };
  }).sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
}

/**
 * Generate trace data for the search operation
 */
function generateTrace(
  options: DemoSearchRequest,
  _resultCount: number
): TraceSummary {

  const steps: TraceStep[] = [];
  let currentMs = 0;
  let totalCost = 0;
  let tokensUsed = 0;

  // Step 1: Query Embedding
  const embedStart = currentMs;
  const embedDuration = 30 + Math.random() * 20; // 30-50ms
  currentMs += embedDuration;
  steps.push({
    name: "Query Embedding",
    stage: "embed",
    startMs: embedStart,
    endMs: currentMs,
    model: "voyage-3",
    inputSize: options.query.length,
    outputSize: 1024,
    cost: 0.0001,
  });
  totalCost += 0.0001;
  tokensUsed += Math.ceil(options.query.length / 4);

  // Step 2: Vector Search
  const searchStart = currentMs;
  const searchDuration = 40 + Math.random() * 30; // 40-70ms
  currentMs += searchDuration;
  steps.push({
    name: "Vector Search",
    stage: "search",
    startMs: searchStart,
    endMs: currentMs,
    model: "pgvector",
    inputSize: 1024,
    outputSize: 50,
    cached: false,
    cost: 0.0,
    details: { candidates: 50, index: "hnsw_l2", ef_search: 100 },
  });

  // Step 3: Hybrid Merge (if enabled)
  if (options.hybridSearch) {
    const hybridStart = currentMs;
    const hybridDuration = 20 + Math.random() * 15; // 20-35ms
    currentMs += hybridDuration;
    steps.push({
      name: "Hybrid Merge",
      stage: "search",
      startMs: hybridStart,
      endMs: currentMs,
      inputSize: 50,
      outputSize: 25,
      details: { bm25_weight: 0.3, vector_weight: 0.7 },
    });
  }

  // Step 4: Rerank (if enabled)
  if (options.rerank) {
    const rerankStart = currentMs;
    const rerankDuration = 120 + Math.random() * 60; // 120-180ms
    currentMs += rerankDuration;
    const rerankCost = 0.0015 + Math.random() * 0.0005;
    steps.push({
      name: "Cross-encoder Rerank",
      stage: "rerank",
      startMs: rerankStart,
      endMs: currentMs,
      model: "rerank-v3.5",
      inputSize: options.hybridSearch ? 25 : 50,
      outputSize: options.topK || 5,
      cost: rerankCost,
    });
    totalCost += rerankCost;
    tokensUsed += 800 + Math.floor(Math.random() * 200);
  }

  // Step 5: Answer Contract Validation (if enabled)
  if (options.answerContract) {
    const contractStart = currentMs;
    const contractDuration = 40 + Math.random() * 20; // 40-60ms
    currentMs += contractDuration;
    const contractCost = 0.0003 + Math.random() * 0.0002;
    steps.push({
      name: "Answer Contract Validation",
      stage: "validate",
      startMs: contractStart,
      endMs: currentMs,
      model: "gpt-4o-mini",
      cost: contractCost,
      details: { contract: "sufficient_evidence", passed: true },
    });
    totalCost += contractCost;
    tokensUsed += 200 + Math.floor(Math.random() * 100);
  }

  return {
    totalLatencyMs: currentMs,
    totalCost,
    tokensUsed,
    vectorOps: 1,
    steps,
  };
}

/**
 * Generate cost breakdown
 */
function generateCostBreakdown(options: DemoSearchRequest, trace: TraceSummary): CostBreakdown {
  const embedding = 0.0001;
  const vectorSearch = 0.0;
  const rerank = options.rerank ? (trace.steps.find((s) => s.name.includes("Rerank"))?.cost || 0.0018) : 0;
  const answerContract = options.answerContract ? (trace.steps.find((s) => s.name.includes("Contract"))?.cost || 0.0004) : 0;

  return {
    embedding,
    vectorSearch,
    rerank,
    answerContract,
    total: embedding + vectorSearch + rerank + answerContract,
    tokensIn: Math.ceil(options.query.length / 4) + (options.rerank ? 500 : 0),
    tokensOut: options.answerContract ? 300 : 0,
    queryUnits: 1 + (options.hybridSearch ? 0.5 : 0) + (options.rerank ? 1 : 0),
  };
}

// =============================================================================
// API Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Check rate limit
    const rateLimit = checkDemoRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Too many demo requests. Please wait a moment and try again.",
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": DEMO_RATE_LIMIT.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(rateLimit.resetAt / 1000).toString(),
            "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Parse request body
    const body = (await request.json()) as DemoSearchRequest;
    const {
      query,
      topK = 5,
      hybridSearch = true,
      rerank = true,
      answerContract = false,
      budgetMs = 500,
    } = body;

    // Validate query
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Invalid query", message: "Query must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(query, { topK, hybridSearch, rerank, answerContract });
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse, {
        headers: {
          "X-RateLimit-Limit": DEMO_RATE_LIMIT.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": Math.ceil(rateLimit.resetAt / 1000).toString(),
          "X-Cache": "HIT",
        },
      });
    }

    // Simulate processing delay based on budget
    const simulatedDelay = Math.min(budgetMs * 0.6, 300) + Math.random() * 100;
    await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

    // Search documents
    const documents = demoDataset.documents as DemoDocument[];
    let results: SearchResult[] = documents
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        score: calculateRelevance(query, doc),
        metadata: doc.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, hybridSearch ? 25 : topK);

    // Apply reranking if enabled
    if (rerank) {
      results = simulateRerank(results, query).slice(0, topK);
    } else {
      results = results.slice(0, topK);
    }

    // Generate trace
    const options: DemoSearchRequest = { query, topK, hybridSearch, rerank, answerContract, budgetMs };
    const trace = generateTrace(options, results.length);

    // Generate cost breakdown
    const cost = generateCostBreakdown(options, trace);

    // Generate trace ID
    const traceId = `tr_demo_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    const response: DemoSearchResponse = {
      traceId,
      results,
      trace,
      cost,
      cached: false,
    };

    // Cache the response
    setCachedResponse(cacheKey, response);

    return NextResponse.json(response, {
      headers: {
        "X-RateLimit-Limit": DEMO_RATE_LIMIT.toString(),
        "X-RateLimit-Remaining": rateLimit.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(rateLimit.resetAt / 1000).toString(),
        "X-Cache": "MISS",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[demo-search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: "An error occurred processing your request" },
      { status: 500 }
    );
  }
}

// Health check / info endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/public/demo-search",
    description: "Public demo search endpoint for landing page",
    rateLimit: {
      limit: DEMO_RATE_LIMIT,
      windowMs: DEMO_WINDOW_MS,
    },
    dataset: {
      name: demoDataset.metadata.name,
      documentCount: demoDataset.metadata.documentCount,
    },
    parameters: {
      query: "string (required) - Search query",
      topK: "number (optional) - Number of results (default: 5)",
      hybridSearch: "boolean (optional) - Enable hybrid search (default: true)",
      rerank: "boolean (optional) - Enable reranking (default: true)",
      answerContract: "boolean (optional) - Enable answer contract validation (default: false)",
      budgetMs: "number (optional) - Latency budget in ms (default: 500)",
    },
  });
}
