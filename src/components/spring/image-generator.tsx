"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageModel, IMAGE_MODELS, GeneratedImage } from "@/lib/spring/types";

interface ImageGeneratorProps {
  onClose: () => void;
  onImageGenerated?: (image: GeneratedImage) => void;
}

export function ImageGenerator({ onClose, onImageGenerated }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [model, setModel] = useState<ImageModel>("sd-xl");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [numImages, setNumImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const modelConfig = IMAGE_MODELS[model];

  // Aspect ratio to dimensions
  const getResolution = (ratio: string): { width: number; height: number } => {
    const resolutions: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "16:9": { width: 1792, height: 1024 },
      "9:16": { width: 1024, height: 1792 },
      "4:3": { width: 1152, height: 896 },
      "3:4": { width: 896, height: 1152 },
      "21:9": { width: 1536, height: 640 },
    };
    return resolutions[ratio] || resolutions["1:1"];
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    const { width, height } = getResolution(aspectRatio);

    try {
      const res = await fetch("/api/spring/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negative_prompt: negativePrompt.trim() || undefined,
          model,
          width,
          height,
          num_images: numImages,
          quality,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      setGeneratedImages(data.images);
      if (data.images?.[0] && onImageGenerated) {
        onImageGenerated(data.images[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Image Generator</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 resize-none"
            />
          </div>

          {/* Negative Prompt (only for SD models) */}
          {modelConfig.supports.negativePrompt && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Negative Prompt (optional)
              </label>
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Things to avoid in the image..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
          )}

          {/* Model Selection */}
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(IMAGE_MODELS).map(([id, config]) => (
              <button
                key={id}
                onClick={() => setModel(id as ImageModel)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  model === id
                    ? "border-pink-500 bg-pink-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium text-sm">{config.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  ${config.pricePerImage.toFixed(3)}/image
                </div>
              </button>
            ))}
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              >
                {modelConfig.supportedAspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality (DALL-E 3 only) */}
            {modelConfig.supports.hdQuality && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quality
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as "standard" | "hd")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                >
                  <option value="standard">Standard</option>
                  <option value="hd">HD</option>
                </select>
              </div>
            )}

            {/* Number of Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Images
              </label>
              <select
                value={numImages}
                onChange={(e) => setNumImages(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              >
                <option value={1}>1 image</option>
                <option value={2}>2 images</option>
                <option value={4}>4 images</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Generated Images */}
          {generatedImages.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {generatedImages.map((image, index) => (
                <div key={image.id || index} className="relative group">
                  <div className="w-full overflow-hidden rounded-lg shadow-md aspect-square">
                    <Image
                      src={image.url}
                      alt={image.prompt || "generated image"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      priority={index === 0}
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                    <a
                      href={image.url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white rounded-lg text-gray-700 hover:bg-gray-100"
                    >
                      <DownloadIcon className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Est. cost: ${(modelConfig.pricePerImage * numImages).toFixed(3)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                prompt.trim() && !isGenerating
                  ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <LoadingIcon className="w-4 h-4 animate-spin" />
                  Generating...
                </span>
              ) : (
                "Generate"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
