// Seizn Spring - Image Models API Route
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { IMAGE_MODELS, DALLE3_PRICING } from '@/lib/spring/types';
import { STABILITY_STYLE_PRESETS } from '@/lib/spring/image-providers';
import { getUserPlan } from '@/lib/spring/db';

export const runtime = 'nodejs';

// ===========================================
// GET /api/spring/images/models - List Available Image Models
// ===========================================
export async function GET() {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Get user plan to filter available models
    const userPlan = await getUserPlan(userId);

    // 3. Map tier to numeric level for comparison
    const tierLevel: Record<string, number> = {
      free: 0,
      starter: 1,
      plus: 2,
      pro: 3,
      enterprise: 4,
    };

    const userTierLevel = tierLevel[userPlan] || 0;

    // 4. Build models list with availability
    const models = Object.values(IMAGE_MODELS).map((model) => {
      const modelTierLevel = tierLevel[model.tier] || 0;
      const isAvailable = userTierLevel >= modelTierLevel;

      return {
        id: model.id,
        name: model.name,
        provider: model.provider,
        description: model.description,
        pricePerImage: model.pricePerImage,
        maxDimensions: {
          width: model.maxWidth,
          height: model.maxHeight,
        },
        supportedAspectRatios: model.supportedAspectRatios,
        features: {
          negativePrompt: model.supports.negativePrompt,
          stylePreset: model.supports.stylePreset,
          hdQuality: model.supports.hdQuality,
        },
        tier: model.tier,
        available: isAvailable,
        upgradeRequired: !isAvailable ? model.tier : null,
      };
    });

    // 5. Return response
    return NextResponse.json({
      models,
      user: {
        plan: userPlan,
        tierLevel: userTierLevel,
      },
      pricing: {
        dalle3: DALLE3_PRICING,
      },
      stylePresets: STABILITY_STYLE_PRESETS,
    });
  } catch (error) {
    console.error('List image models error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image models' },
      { status: 500 }
    );
  }
}
