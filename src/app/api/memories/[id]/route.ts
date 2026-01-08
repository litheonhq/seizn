import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/memories/[id] - Get a specific memory
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_prefix', apiKey.substring(0, 8))
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = keyData.user_id;

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

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_prefix', apiKey.substring(0, 8))
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = keyData.user_id;

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

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_prefix', apiKey.substring(0, 8))
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = keyData.user_id;

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
