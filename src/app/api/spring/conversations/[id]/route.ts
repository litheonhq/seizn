// Seizn Spring - Single Conversation API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getConversation,
  updateConversation,
  archiveConversation,
  shareConversation,
  getMessages,
} from '@/lib/spring/db';
import type { Message } from '@/lib/spring/types';

type RouteParams = { params: Promise<{ id: string }> };

// ===========================================
// GET /api/spring/conversations/[id] - Get conversation with messages
// ===========================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeMessages = searchParams.get('messages') !== 'false';
    const messageLimit = parseInt(searchParams.get('message_limit') || '100');

    const conversation = await getConversation(id, session.user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    let messages: Message[] = [];
    if (includeMessages) {
      messages = await getMessages(id, session.user.id, { limit: messageLimit });
    }

    return NextResponse.json({
      conversation,
      messages,
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================
// PATCH /api/spring/conversations/[id] - Update conversation
// ===========================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Handle special actions
    if (body.action === 'share') {
      const shareId = await shareConversation(id, session.user.id);
      return NextResponse.json({
        share_id: shareId,
        share_url: `${process.env.NEXT_PUBLIC_APP_URL}/share/${shareId}`,
      });
    }

    if (body.action === 'unshare') {
      await updateConversation(id, session.user.id, {
        // @ts-expect-error - We need to handle this in the DB function
        is_shared: false,
        share_id: null,
      });
      return NextResponse.json({ success: true });
    }

    // Regular update
    const { title, default_model, system_prompt, memory_enabled, memory_namespace } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (default_model !== undefined) updates.default_model = default_model;
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (memory_enabled !== undefined) updates.memory_enabled = memory_enabled;
    if (memory_namespace !== undefined) updates.memory_namespace = memory_namespace;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const conversation = await updateConversation(id, session.user.id, updates);
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================
// DELETE /api/spring/conversations/[id] - Archive conversation
// ===========================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await archiveConversation(id, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
