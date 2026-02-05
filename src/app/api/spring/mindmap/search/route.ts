/**
 * MindMap API - Search Route
 *
 * GET /api/spring/mindmap/search - Search within the graph
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';
import type {
  MindMapNode,
  MemoryNote,
} from '@/lib/spring/memory-v3/types';

// =============================================================================
// Types
// =============================================================================

interface SearchMatch {
  /** Start position of match in content */
  start: number;
  /** End position of match in content */
  end: number;
  /** The matched text */
  text: string;
}

interface HighlightedMindMapNode extends MindMapNode {
  /** Whether this node matches the search query */
  isMatch: boolean;
  /** Matches found in the content */
  matches?: SearchMatch[];
  /** Search relevance score (0-1) */
  searchScore?: number;
}

interface SearchResponse {
  /** Nodes matching the search query, with highlighting info */
  nodes: HighlightedMindMapNode[];
  /** Total number of matches found */
  totalMatches: number;
  /** The query that was searched */
  query: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a MemoryNote to a HighlightedMindMapNode
 */
function noteToHighlightedNode(
  note: MemoryNote,
  query: string,
  searchScore: number
): HighlightedMindMapNode {
  const matches = findMatches(note.content, query);

  return {
    id: note.id,
    type: 'note',
    label: note.content.substring(0, 100) + (note.content.length > 100 ? '...' : ''),
    content: note.content,
    note: note,
    depth: 0,
    relevance: note.salience?.score,
    isMatch: true,
    matches,
    searchScore,
  };
}

/**
 * Find all matches of the query in the content
 */
function findMatches(content: string, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const contentLower = content.toLowerCase();
  const queryLower = query.toLowerCase();

  // Split query into words for word-level matching
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);

  for (const word of queryWords) {
    let startIndex = 0;
    let index: number;

    while ((index = contentLower.indexOf(word, startIndex)) !== -1) {
      matches.push({
        start: index,
        end: index + word.length,
        text: content.substring(index, index + word.length),
      });
      startIndex = index + 1;
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Merge overlapping matches
  const mergedMatches: SearchMatch[] = [];
  for (const match of matches) {
    if (mergedMatches.length === 0) {
      mergedMatches.push(match);
    } else {
      const last = mergedMatches[mergedMatches.length - 1];
      if (match.start <= last.end) {
        // Overlapping, merge them
        last.end = Math.max(last.end, match.end);
        last.text = content.substring(last.start, last.end);
      } else {
        mergedMatches.push(match);
      }
    }
  }

  return mergedMatches;
}

/**
 * Calculate a search relevance score based on query matching
 */
function calculateSearchScore(note: MemoryNote, query: string): number {
  const contentLower = note.content.toLowerCase();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);

  if (queryWords.length === 0) return 0;

  // Exact phrase match gets highest score
  if (contentLower.includes(queryLower)) {
    return 1.0;
  }

  // Count word matches
  let matchedWords = 0;
  let totalMatchCount = 0;

  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matchedWords++;

      // Count occurrences
      let startIndex = 0;
      let index: number;
      while ((index = contentLower.indexOf(word, startIndex)) !== -1) {
        totalMatchCount++;
        startIndex = index + 1;
      }
    }
  }

  // Calculate base score from word coverage
  const coverageScore = matchedWords / queryWords.length;

  // Boost for multiple occurrences (diminishing returns)
  const occurrenceBoost = Math.min(totalMatchCount / 10, 0.2);

  // Boost for notes where query words appear in first 100 chars (title-like)
  const titleBoost = contentLower.substring(0, 100).includes(queryLower.split(/\s+/)[0]) ? 0.1 : 0;

  // Combine with salience if available
  const salienceBoost = (note.salience?.score || 0.5) * 0.1;

  return Math.min(coverageScore + occurrenceBoost + titleBoost + salienceBoost, 1.0);
}

// =============================================================================
// GET /api/spring/mindmap/search - Search Graph
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const query = searchParams.get('query') || searchParams.get('q');
    const limitParam = searchParams.get('limit');

    // Validate required parameters
    if (!query || query.trim().length === 0) {
      return ValidationErrors.missingField('query');
    }

    // Validate query length
    if (query.length > 500) {
      return ValidationErrors.invalidField('query', 'Query must be 500 characters or less');
    }

    // Parse limit
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 20;
    if (isNaN(limit)) {
      return ValidationErrors.invalidField('limit', 'must be a positive integer');
    }

    // Initialize service
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);

    // Perform search using the memory service
    const searchResults = await service.searchNotes(query.trim(), {
      userId,
      limit: limit * 2, // Get extra results to filter and rank
      statuses: ['active'],
      hybridSearch: true,
    });

    // Convert to highlighted nodes with scores
    const scoredNodes: HighlightedMindMapNode[] = [];

    for (const note of searchResults) {
      const searchScore = calculateSearchScore(note, query);

      // Only include nodes with meaningful matches
      if (searchScore > 0.1) {
        scoredNodes.push(noteToHighlightedNode(note, query, searchScore));
      }
    }

    // Sort by search score
    scoredNodes.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));

    // Take top results
    const nodes = scoredNodes.slice(0, limit);

    // Count total matches across all results
    const totalMatches = nodes.reduce(
      (sum, node) => sum + (node.matches?.length || 0),
      0
    );

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mindmap/search', method: 'GET', startTime },
      200,
      { embedding: query.length }
    );

    // Build response
    const response = NextResponse.json<SearchResponse>(
      {
        nodes,
        totalMatches,
        query: query.trim(),
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('MindMap search GET error:', error);
    return ServerErrors.internal('mindmap_search');
  }
}
