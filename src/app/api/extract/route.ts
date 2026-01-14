// Memory Extraction API - Extract memories from conversations using Claude AI
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractMemories, createEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  extractSlots,
  upsertSlots,
  getAllSlots,
  type SlotData,
} from '@/lib/memory/slot';

// POST /api/extract - Extract and store memories from conversation
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse request body
    const body = await request.json();
    const {
      conversation,
      model = 'haiku',
      auto_store = true,
      namespace = 'default',
      extract_slots = true, // New option to enable slot extraction
    } = body;

    if (!conversation || typeof conversation !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/extract', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'conversation (string) is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get existing memories for deduplication
    const { data: existingMemories } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const existingContents = existingMemories?.map((m) => m.content) || [];

    // Extract memories using Claude
    const extracted = await extractMemories(conversation, {
      model: model as 'haiku' | 'sonnet',
      existingMemories: existingContents,
    });

    // Extract slots in parallel (if enabled)
    let slotResult: { success: number; failed: number; slots: SlotData[] } = {
      success: 0,
      failed: 0,
      slots: [],
    };

    if (extract_slots && auto_store) {
      // Get existing slots for context
      const existingSlots = await getAllSlots(userId, namespace);
      const existingSlotsMap = new Map(
        existingSlots.map((s) => [s.slot_key, s.slot_value])
      );

      // Extract slots from conversation
      const extractedSlots = await extractSlots(conversation, existingSlotsMap);

      if (extractedSlots.slots.length > 0) {
        // Upsert extracted slots
        const upsertResult = await upsertSlots(userId, extractedSlots.slots, {
          namespace,
          source: 'extract',
        });

        slotResult = {
          success: upsertResult.success,
          failed: upsertResult.failed,
          slots: extractedSlots.slots,
        };
      }
    }

    if (extracted.length === 0 && slotResult.slots.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/extract', method: 'POST', startTime },
        200,
        { input: conversation.length, output: 0 }
      );
      return NextResponse.json({
        message: 'No significant memories or slots found in the conversation',
        extracted: [],
        stored: 0,
        slots: { extracted: 0, stored: 0 },
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
              user_id: userId,
              content: memory.content,
              memory_type: memory.memory_type,
              tags: memory.tags,
              importance: memory.importance,
              embedding,
              namespace,
              source: 'extract_api',
              confidence: memory.confidence,
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

    // Log successful request with token estimates
    await logRequest(
      { userId, keyId, endpoint: '/api/extract', method: 'POST', startTime },
      200,
      {
        input: Math.ceil(conversation.length / 4), // Approximate tokens
        output: Math.ceil(JSON.stringify(extracted).length / 4),
        embedding: storedCount * 500, // Approximate embedding tokens
      }
    );

    return NextResponse.json({
      message: `Extracted ${extracted.length} memories, stored ${storedCount}. Slots: ${slotResult.success} stored.`,
      extracted: extracted.map((m) => ({
        content: m.content,
        memory_type: m.memory_type,
        tags: m.tags,
        confidence: m.confidence,
        importance: m.importance,
      })),
      stored: auto_store ? storedMemories : null,
      slots: {
        extracted: slotResult.slots.length,
        stored: slotResult.success,
        failed: slotResult.failed,
        items: slotResult.slots.map((s) => ({
          key: s.slot_key,
          value: s.slot_value,
          confidence: s.confidence,
        })),
      },
    });
  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
