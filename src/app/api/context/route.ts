/**
 * Context API
 *
 * Returns ready-to-inject context string for LLM prompts.
 * Zep/Memobase style API for easy integration.
 *
 * GET /api/context?format=detailed&includeProfile=true
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { createContextService, type ContextFormat, type ContextOptions } from '@/lib/spring/memory-v4/context-service';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse options from query params
    const options: ContextOptions = {
      format: (searchParams.get('format') as ContextFormat) ?? 'detailed',
      maxTokens: searchParams.get('maxTokens') ? parseInt(searchParams.get('maxTokens')!) : undefined,
      includeProfile: searchParams.get('includeProfile') !== 'false',
      includeRecentMessages: searchParams.get('includeRecentMessages') !== 'false',
      recentMessageCount: searchParams.get('recentMessageCount')
        ? parseInt(searchParams.get('recentMessageCount')!)
        : undefined,
      includeFacts: searchParams.get('includeFacts') !== 'false',
      includeGraph: searchParams.get('includeGraph') === 'true',
      tierStrategy: searchParams.get('tierStrategy') as ContextOptions['tierStrategy'] ?? undefined,
      query: searchParams.get('query') ?? undefined,
      types: searchParams.get('types')?.split(',').filter(Boolean),
      tags: searchParams.get('tags')?.split(',').filter(Boolean),
      categories: searchParams.get('categories')?.split(',').filter(Boolean),
    };

    // Parse tier budgets if provided
    const hotBudget = searchParams.get('tierBudget.hot');
    const warmBudget = searchParams.get('tierBudget.warm');
    const coldBudget = searchParams.get('tierBudget.cold');

    if (hotBudget || warmBudget || coldBudget) {
      options.tierBudgets = {
        hot: hotBudget ? parseInt(hotBudget) : undefined,
        warm: warmBudget ? parseInt(warmBudget) : undefined,
        cold: coldBudget ? parseInt(coldBudget) : undefined,
      };
    }

    const supabase = createServerClient();
    const contextService = createContextService(supabase);

    const response = await contextService.getContext(session.user.id, options);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Context API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get context' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/context
 *
 * Alternative with JSON body for complex options
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const options = (await request.json()) as ContextOptions;

    const supabase = createServerClient();
    const contextService = createContextService(supabase);

    const response = await contextService.getContext(session.user.id, options);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Context API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get context' },
      { status: 500 }
    );
  }
}
