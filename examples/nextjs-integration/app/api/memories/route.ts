/**
 * Next.js API Route - Memories
 *
 * Server-side API for storing and querying semantic memories
 * using the Seizn Spring SDK.
 */

import { NextRequest, NextResponse } from "next/server";
import { SeizSpring } from "@seizn/spring";

// Initialize client (server-side only)
const spring = new SeizSpring({
  apiKey: process.env.SEIZN_API_KEY!,
});

// POST /api/memories - Store a new memory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, type, metadata } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const result = await spring.memories.create({
      content,
      type: type || "fact",
      metadata,
    });

    return NextResponse.json({
      success: true,
      memory: result,
    });
  } catch (error) {
    console.error("Memory creation error:", error);
    return NextResponse.json(
      { error: "Failed to store memory" },
      { status: 500 }
    );
  }
}

// GET /api/memories - Query memories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "5");

    if (!query) {
      // List recent memories if no query
      const result = await spring.memories.list({ limit });
      return NextResponse.json({
        success: true,
        memories: result.memories,
      });
    }

    // Semantic search
    const result = await spring.memories.query({
      query,
      limit,
      threshold: 0.7,
      includeTrace: true,
    });

    return NextResponse.json({
      success: true,
      results: result.results,
      trace: result.trace,
    });
  } catch (error) {
    console.error("Memory query error:", error);
    return NextResponse.json(
      { error: "Failed to query memories" },
      { status: 500 }
    );
  }
}
