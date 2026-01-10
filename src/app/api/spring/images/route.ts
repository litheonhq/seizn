// Seizn Spring - Image Generation API Route
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  generateImages,
  calculateImageCost,
} from '@/lib/spring/image-providers';
import {
  checkQuota,
  recordUsage,
  saveGeneratedImage,
  listGeneratedMedia,
} from '@/lib/spring/db';
import { ImageModel, IMAGE_MODELS, ImageGenerationRequest } from '@/lib/spring/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ===========================================
// POST /api/spring/images - Generate Image
// ===========================================
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse request
    const body: ImageGenerationRequest = await request.json();
    const {
      prompt,
      negative_prompt,
      model = 'sd-xl',
      width = 1024,
      height = 1024,
      num_images = 1,
      style,
      quality = 'standard',
    } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 3. Validate model
    if (!IMAGE_MODELS[model as ImageModel]) {
      return NextResponse.json({ error: 'Invalid image model' }, { status: 400 });
    }

    // 4. Validate num_images
    if (num_images < 1 || num_images > 4) {
      return NextResponse.json(
        { error: 'num_images must be between 1 and 4' },
        { status: 400 }
      );
    }

    // 5. Check quota based on model type
    const mediaType = model === 'dall-e-3' ? 'dalle_image' : 'sd_image';
    const quotaCheck = await checkQuota(userId, { mediaType });

    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.message,
          quota: quotaCheck,
        },
        { status: 429 }
      );
    }

    // Check if enough quota for requested number of images
    if (quotaCheck.remaining < num_images) {
      return NextResponse.json(
        {
          error: `Insufficient quota. You can generate ${quotaCheck.remaining} more images today.`,
          quota: quotaCheck,
        },
        { status: 429 }
      );
    }

    // 6. Generate image(s)
    const startTime = Date.now();
    const images = await generateImages({
      prompt,
      negative_prompt,
      model: model as ImageModel,
      width,
      height,
      num_images,
      style,
      quality,
    });

    const latencyMs = Date.now() - startTime;

    // 7. Calculate total cost
    const modelConfig = IMAGE_MODELS[model as ImageModel];
    const totalCostCents = calculateImageCost(model as ImageModel, images.length, {
      quality,
      size: `${width}x${height}`,
    });

    // 8. Save images to database and record usage
    const savedImages = await Promise.all(
      images.map(async (image) => {
        const saved = await saveGeneratedImage(userId, {
          provider: modelConfig.provider,
          model,
          prompt,
          negativePrompt: negative_prompt,
          url: image.url,
          thumbnailUrl: image.thumbnail_url,
          width: image.width,
          height: image.height,
          settings: { style, quality },
          creditsUsed: 1,
        });
        return { ...image, id: saved.id };
      })
    );

    // 9. Record usage
    await recordUsage(userId, {
      sdImages: model.startsWith('sd') ? images.length : 0,
      dalleImages: model === 'dall-e-3' ? images.length : 0,
      costCents: totalCostCents,
    });

    // 10. Return response
    return NextResponse.json({
      success: true,
      images: savedImages,
      usage: {
        images_generated: images.length,
        cost_cents: totalCostCents,
        latency_ms: latencyMs,
      },
      quota: {
        remaining: quotaCheck.remaining - images.length,
        plan: quotaCheck.plan,
      },
    });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Image generation failed',
      },
      { status: 500 }
    );
  }
}

// ===========================================
// GET /api/spring/images - List Generated Images
// ===========================================
export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 3. Fetch images
    const images = await listGeneratedMedia(userId, {
      type: 'image',
      limit,
      offset,
    });

    return NextResponse.json({
      images,
      pagination: {
        limit,
        offset,
        has_more: images.length === limit,
      },
    });
  } catch (error) {
    console.error('List images error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}
