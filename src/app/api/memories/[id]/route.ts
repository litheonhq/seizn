import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { hashApiKey } from '@/lib/api-key';
import { logMemoryAccess } from '@/lib/audit';
import { extractApiKey } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper function to verify API key
async function verifyApiKey(apiKey: string): Promise<{ userId: string; keyId: string } | null> {
  const supabase = createServerClient();
  const keyHash = hashApiKey(apiKey);

  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash);

  return { userId: keyData.user_id, keyId: keyData.id };
}

// GET /api/memories/[id] - Get a specific memory
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { apiKey } = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required. Use Authorization: Bearer <your-api-key> header.' },
        { status: 401 }
      );
    }

    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Get memory
    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select('id, content, memory_type, tags, scope, source, confidence, importance, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    // Audit log: single memory read
    logMemoryAccess(request, userId, keyId, 'read', {
      memoryId: id,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      memory: memory,
    });
  } catch (error) {
    console.error('Get memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/memories/[id] - Update a memory
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { apiKey } = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required. Use Authorization: Bearer <your-api-key> header.' },
        { status: 401 }
      );
    }

    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    // Build update object (only allowed fields)
    const updateData: Record<string, unknown> = {};
    if (body.memory_type) updateData.memory_type = body.memory_type;
    if (body.tags) updateData.tags = body.tags;
    if (body.importance !== undefined) updateData.importance = body.importance;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update memory
    const { data: memory, error: updateError } = await supabase
      .from('memories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id, content, memory_type, tags, importance, updated_at')
      .single();

    if (updateError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found or update failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      memory: memory,
    });
  } catch (error) {
    console.error('Update memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/memories/[id] - Soft delete a memory
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { apiKey } = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required. Use Authorization: Bearer <your-api-key> header.' },
        { status: 401 }
      );
    }

    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    // Soft delete (set is_deleted = true)
    const { data: memory, error: deleteError } = await supabase
      .from('memories')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id')
      .single();

    if (deleteError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Memory deleted',
      id: memory.id,
    });
  } catch (error) {
    console.error('Delete memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
