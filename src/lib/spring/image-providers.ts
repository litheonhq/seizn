// Seizn Spring - Image Generation Providers
// Supports: Stability AI (SD-XL, SD-3), OpenAI (DALL-E 3)

import OpenAI from 'openai';
import {
  ImageModel,
  ImageGenerationRequest,
  GeneratedImage,
  IMAGE_MODELS,
  DALLE3_PRICING,
} from './types';

// ===========================================
// Provider Clients (Lazy Initialization)
// ===========================================
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

const STABILITY_API_URL = 'https://api.stability.ai/v2beta';

// ===========================================
// Main Generation Function
// ===========================================
export async function generateImage(
  request: ImageGenerationRequest
): Promise<GeneratedImage> {
  const model = request.model || 'sd-xl';
  const modelConfig = IMAGE_MODELS[model];

  if (!modelConfig) {
    throw new Error(`Unsupported image model: ${model}`);
  }

  switch (modelConfig.provider) {
    case 'openai':
      return generateWithDallE(request, model);
    case 'stability':
      return generateWithStability(request, model);
    default:
      throw new Error(`Unknown provider: ${modelConfig.provider}`);
  }
}

// ===========================================
// DALL-E 3 Provider
// ===========================================
async function generateWithDallE(
  request: ImageGenerationRequest,
  model: ImageModel
): Promise<GeneratedImage> {
  const { prompt, width = 1024, height = 1024, style = 'vivid', quality = 'standard' } = request;

  // DALL-E 3 only supports specific sizes
  const size = getDallESize(width, height);
  const costCents = calculateDallECost(size, quality);

  const openai = getOpenAIClient();
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1, // DALL-E 3 only supports 1 image at a time
    size: size as '1024x1024' | '1024x1792' | '1792x1024',
    style: style === 'natural' ? 'natural' : 'vivid',
    quality: quality === 'hd' ? 'hd' : 'standard',
    response_format: 'url',
  });

  if (!response.data || response.data.length === 0) {
    throw new Error('No image data returned from DALL-E');
  }

  const imageData = response.data[0];
  const [actualWidth, actualHeight] = size.split('x').map(Number);

  return {
    id: `dalle-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    url: imageData.url || '',
    prompt,
    revised_prompt: imageData.revised_prompt,
    model,
    width: actualWidth,
    height: actualHeight,
    cost_cents: costCents,
    created_at: new Date().toISOString(),
  };
}

function getDallESize(width: number, height: number): string {
  // Map to closest supported size
  const ratio = width / height;

  if (ratio > 1.5) {
    return '1792x1024'; // Landscape
  } else if (ratio < 0.67) {
    return '1024x1792'; // Portrait
  }
  return '1024x1024'; // Square
}

function calculateDallECost(size: string, quality: 'standard' | 'hd'): number {
  const pricing = quality === 'hd' ? DALLE3_PRICING.hd : DALLE3_PRICING.standard;
  const priceUsd = pricing[size as keyof typeof pricing] || 0.04;
  return Math.round(priceUsd * 100);
}

// ===========================================
// Stability AI Provider
// ===========================================
async function generateWithStability(
  request: ImageGenerationRequest,
  model: ImageModel
): Promise<GeneratedImage> {
  const stabilityApiKey = process.env.STABILITY_API_KEY;
  if (!stabilityApiKey) {
    throw new Error('STABILITY_API_KEY is not configured');
  }

  const {
    prompt,
    negative_prompt,
    width = 1024,
    height = 1024,
    style,
  } = request;

  // Select endpoint based on model
  const endpoint = model === 'sd-3'
    ? `${STABILITY_API_URL}/stable-image/generate/sd3`
    : `${STABILITY_API_URL}/stable-image/generate/core`;

  // Build form data
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'png');

  // Validate and set dimensions
  const validatedDimensions = validateStabilityDimensions(width, height, model);
  formData.append('aspect_ratio', validatedDimensions.aspectRatio);

  if (negative_prompt) {
    formData.append('negative_prompt', negative_prompt);
  }

  if (style && model !== 'sd-3') {
    // SD-XL supports style presets
    formData.append('style_preset', style);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stabilityApiKey}`,
      'Accept': 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Stability API error: ${error.message || response.statusText}`);
  }

  // Response is image binary
  const imageBuffer = await response.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  const modelConfig = IMAGE_MODELS[model];
  const costCents = Math.round(modelConfig.pricePerImage * 100);

  return {
    id: `sd-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    url: dataUrl, // Base64 data URL (should upload to storage in production)
    prompt,
    model,
    width: validatedDimensions.width,
    height: validatedDimensions.height,
    cost_cents: costCents,
    created_at: new Date().toISOString(),
  };
}

function validateStabilityDimensions(
  width: number,
  height: number,
  _model: ImageModel
): { width: number; height: number; aspectRatio: string } {
  const ratio = width / height;

  // Map to supported aspect ratios
  if (ratio > 2) {
    return { width: 1536, height: 640, aspectRatio: '21:9' };
  } else if (ratio > 1.5) {
    return { width: 1344, height: 768, aspectRatio: '16:9' };
  } else if (ratio > 1.2) {
    return { width: 1152, height: 896, aspectRatio: '4:3' };
  } else if (ratio > 0.8) {
    return { width: 1024, height: 1024, aspectRatio: '1:1' };
  } else if (ratio > 0.6) {
    return { width: 896, height: 1152, aspectRatio: '3:4' };
  } else {
    return { width: 768, height: 1344, aspectRatio: '9:16' };
  }
}

// ===========================================
// Batch Generation (for multiple images)
// ===========================================
export async function generateImages(
  request: ImageGenerationRequest
): Promise<GeneratedImage[]> {
  const numImages = request.num_images || 1;
  const model = request.model || 'sd-xl';

  // DALL-E 3 only supports 1 image at a time
  if (model === 'dall-e-3' || numImages === 1) {
    const results: GeneratedImage[] = [];
    for (let i = 0; i < numImages; i++) {
      const image = await generateImage(request);
      results.push(image);
    }
    return results;
  }

  // Stability AI can generate multiple (via sequential calls)
  const results: GeneratedImage[] = [];
  for (let i = 0; i < numImages; i++) {
    const image = await generateImage(request);
    results.push(image);
  }
  return results;
}

// ===========================================
// Cost Calculation
// ===========================================
export function calculateImageCost(
  model: ImageModel,
  count: number = 1,
  options?: { quality?: 'standard' | 'hd'; size?: string }
): number {
  if (model === 'dall-e-3') {
    const size = options?.size || '1024x1024';
    const quality = options?.quality || 'standard';
    const pricing = quality === 'hd' ? DALLE3_PRICING.hd : DALLE3_PRICING.standard;
    const pricePerImage = pricing[size as keyof typeof pricing] || 0.04;
    return Math.round(pricePerImage * count * 100);
  }

  const modelConfig = IMAGE_MODELS[model];
  return Math.round(modelConfig.pricePerImage * count * 100);
}

// ===========================================
// Style Presets for Stability AI
// ===========================================
export const STABILITY_STYLE_PRESETS = [
  { id: '3d-model', name: '3D Model' },
  { id: 'analog-film', name: 'Analog Film' },
  { id: 'anime', name: 'Anime' },
  { id: 'cinematic', name: 'Cinematic' },
  { id: 'comic-book', name: 'Comic Book' },
  { id: 'digital-art', name: 'Digital Art' },
  { id: 'enhance', name: 'Enhance' },
  { id: 'fantasy-art', name: 'Fantasy Art' },
  { id: 'isometric', name: 'Isometric' },
  { id: 'line-art', name: 'Line Art' },
  { id: 'low-poly', name: 'Low Poly' },
  { id: 'neon-punk', name: 'Neon Punk' },
  { id: 'origami', name: 'Origami' },
  { id: 'photographic', name: 'Photographic' },
  { id: 'pixel-art', name: 'Pixel Art' },
  { id: 'tile-texture', name: 'Tile Texture' },
] as const;

export type StabilityStylePreset = (typeof STABILITY_STYLE_PRESETS)[number]['id'];
