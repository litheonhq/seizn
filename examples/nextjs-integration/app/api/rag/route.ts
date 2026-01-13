/**
 * Next.js API Route - RAG Query
 *
 * Server-side API for RAG queries using the Seizn Summer SDK.
 * Includes hybrid search, reranking, and answer generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { SeizSummer } from "@seizn/summer";

// Initialize client (server-side only)
const summer = new SeizSummer({
  apiKey: process.env.SEIZN_API_KEY!,
});

// POST /api/rag - Query with RAG
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      collection = "default",
      limit = 5,
      rerank = true,
      generateAnswer = true,
    } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const result = await summer.query({
      query,
      collection,
      limit,
      searchType: "hybrid",
      hybridAlpha: 0.7,
      rerank,
      rerankModel: "cohere-rerank-v3",
      generateAnswer,
      answerModel: "gpt-4o-mini",
      includeTrace: true,
    });

    return NextResponse.json({
      success: true,
      answer: result.answer,
      sources: result.sources,
      results: result.results,
      trace: {
        trace_id: result.trace?.trace_id,
        total_ms: result.trace?.total_ms,
        cost_usd: result.trace?.cost_usd,
        // Shareable trace URL
        share_url: `https://seizn.com/trace/${result.trace?.trace_id}`,
      },
    });
  } catch (error) {
    console.error("RAG query error:", error);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 }
    );
  }
}
