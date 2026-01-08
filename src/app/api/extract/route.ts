// Memory Extraction API - Extract memories from conversations using Claude AI
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { hashApiKey } from '@/lib/api-key';
import { extractMemories, createEmbedding } from '@/lib/ai';

// POST /api/extract - Extract and store memories from conversation
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const keyHash = hashApiKey(apiKey);

    // Find the API key and get user
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);

    // Parse request body
    const body = await request.json();
    const {
      conversation,
      model = 'haiku',
      auto_store = true,
      namespace = 'default'
    } = body;

    if (!conversation || typeof conversation !== 'string') {
      return NextResponse.json(
        { error: 'conversation (string) is required' },
        { status: 400 }
      );
    }

    // Get existing memories for deduplication
    const { data: existingMemories } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', keyData.user_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const existingContents = existingMemories?.map(m => m.content) || [];

    // Extract memories using Claude
    const extracted = await extractMemories(conversation, {
      model: model as 'haiku' | 'sonnet',
      existingMemories: existingContents,
    });

    if (extracted.length === 0) {
      return NextResponse.json({
        message: 'No significant memories found in the conversation',
        extracted: [],
        stored: 0,
      });
    }

    // If auto_store is enabled, save memories to database
    let storedCount = 0;
    const storedMemories = [];

    if (auto_store) {
      for (const memory of extracted) {
        try {
          // Generate embedding for the memory
          const embedding = await createEmbedding(memory.content);

          // Insert into database
          const { data: inserted, error: insertError } = await supabase
            .from('memories')
            .insert({
              user_id: keyData.user_id,
              content: memory.content,
              memory_type: memory.memory_type,
              tags: memory.tags,
              importance: memory.importance,
              embedding,
              namespace,
              metadata: {
                confidence: memory.confidence,
                extracted_at: new Date().toISOString(),
                model_used: model,
              },
            })
            .select('id, content, memory_type, tags, importance, created_at')
            .single();

          if (!insertError && inserted) {
            storedMemories.push(inserted);
            storedCount++;
          }
        } catch (err) {
          console.error('Failed to store memory:', err);
          // Continue with other memories
        }
      }
    }

    return NextResponse.json({
      message: `Extracted ${extracted.length} memories, stored ${storedCount}`,
      extracted: extracted.map(m => ({
        content: m.content,
        memory_type: m.memory_type,
        tags: m.tags,
        confidence: m.confidence,
        importance: m.importance,
      })),
      stored: auto_store ? storedMemories : null,
    });

  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
