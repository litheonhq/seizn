import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, extractMemoriesFromImage, describeImageForEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface ImageExtractRequest {
  image: string; // Base64 encoded image data or URL
  media_type?: MediaType;
  context?: string; // Optional context about the image
  model?: 'haiku' | 'sonnet';
  auto_store?: boolean;
  namespace?: string;
}

// POST /api/extract/image - Extract memories from an image
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: ImageExtractRequest = await request.json();

    if (!body.image) {
      await logRequest(
        { userId, keyId, endpoint: '/api/extract/image', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }

    // Detect media type from base64 header or use provided type
    let mediaType: MediaType = body.media_type || 'image/jpeg';
    if (body.image.startsWith('data:')) {
      const match = body.image.match(/data:(image\/[^;]+);base64,/);
      if (match) {
        mediaType = match[1] as MediaType;
        body.image = body.image.replace(/data:image\/[^;]+;base64,/, '');
      }
    }

    // Validate media type
    const validTypes: MediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json(
        { error: 'Invalid media type. Supported: image/jpeg, image/png, image/gif, image/webp' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const model = body.model || 'sonnet';
    const autoStore = body.auto_store !== false;
    const namespace = body.namespace || 'default';

    // Get existing memories to avoid duplicates
    let existingMemories: string[] = [];
    if (autoStore) {
      const { data: existing } = await supabase
        .from('memories')
        .select('content')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (existing) {
        existingMemories = existing.map((m) => m.content);
      }
    }

    // Extract memories from image using Claude Vision
    const extractedMemories = await extractMemoriesFromImage(
      body.image,
      mediaType,
      {
        model,
        context: body.context,
        existingMemories,
      }
    );

    // Store extracted memories if auto_store is enabled
    const storedMemories: Array<{
      id: string;
      content: string;
      memory_type: string;
      tags: string[];
      confidence: number;
      importance: number;
    }> = [];

    if (autoStore && extractedMemories.length > 0) {
      for (const memory of extractedMemories) {
        // Skip low confidence extractions
        if (memory.confidence < 0.5) continue;

        // Create embedding for the memory
        const embedding = await createEmbedding(memory.content);

        // Insert memory
        const { data: inserted, error: insertError } = await supabase
          .from('memories')
          .insert({
            user_id: userId,
            content: memory.content,
            embedding,
            memory_type: memory.memory_type,
            tags: memory.tags,
            namespace,
            source: 'image_extraction',
            confidence: memory.confidence,
            importance: memory.importance,
          })
          .select('id, content, memory_type, tags')
          .single();

        if (!insertError && inserted) {
          storedMemories.push({
            id: inserted.id,
            content: inserted.content,
            memory_type: inserted.memory_type,
            tags: inserted.tags,
            confidence: memory.confidence,
            importance: memory.importance,
          });
        }
      }
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/extract/image', method: 'POST', startTime },
      200,
      { input: 1000, output: 500 } // Approximate token count for vision
    );

    return NextResponse.json({
      success: true,
      extracted: extractedMemories,
      stored: autoStore ? storedMemories : [],
      count: extractedMemories.length,
      stored_count: storedMemories.length,
      model_used: model,
    });
  } catch (error) {
    console.error('Image extraction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/extract/image/embed - Create an embedding for an image
// Creates a text description first, then embeds it
export async function PUT(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: { image: string; media_type?: MediaType } = await request.json();

    if (!body.image) {
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }

    // Detect media type
    let mediaType: MediaType = body.media_type || 'image/jpeg';
    let imageData = body.image;
    if (body.image.startsWith('data:')) {
      const match = body.image.match(/data:(image\/[^;]+);base64,/);
      if (match) {
        mediaType = match[1] as MediaType;
        imageData = body.image.replace(/data:image\/[^;]+;base64,/, '');
      }
    }

    // Get image description
    const description = await describeImageForEmbedding(imageData, mediaType);

    // Create embedding from description
    const embedding = await createEmbedding(description);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/extract/image/embed', method: 'PUT', startTime },
      200,
      { embedding: description.length }
    );

    return NextResponse.json({
      success: true,
      description,
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    console.error('Image embedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
