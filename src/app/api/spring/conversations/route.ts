// Seizn Spring - Conversations API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createConversation,
  listConversations,
} from '@/lib/spring/db';
import { AIModel } from '@/lib/spring/types';

// ===========================================
// GET /api/spring/conversations - List conversations
// ===========================================
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conversations = await listConversations(session.user.id, {
      limit: Math.min(limit, 100),
      offset,
    });

    return NextResponse.json({
      conversations,
      pagination: {
        limit,
        offset,
        hasMore: conversations.length === limit,
      },
    });
  } catch (error) {
    console.error('List conversations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================
// POST /api/spring/conversations - Create conversation
// ===========================================
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      default_model = 'gpt-4o-mini',
      system_prompt,
      memory_enabled = true,
      memory_namespace,
    } = body;

    const conversation = await createConversation(session.user.id, {
      title,
      defaultModel: default_model as AIModel,
      systemPrompt: system_prompt,
      memoryEnabled: memory_enabled,
      memoryNamespace: memory_namespace,
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
