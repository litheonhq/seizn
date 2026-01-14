"use client";

import dynamic from "next/dynamic";
import type { GraphCanvasProps } from "./GraphCanvas";

// Loading skeleton for Graph Canvas
const GraphSkeleton = () => (
  <div className="w-full h-full bg-gray-50 rounded-lg flex items-center justify-center">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      <p className="text-sm text-gray-500">Loading graph visualization...</p>
    </div>
  </div>
);

/**
 * Dynamically loaded GraphCanvas
 * - Lazy loads @xyflow/react library (~150KB)
 * - Shows skeleton while loading
 * - SSR disabled for browser-only features
 */
export const DynamicGraphCanvas = dynamic<GraphCanvasProps>(
  () => import("./GraphCanvas").then((mod) => mod.GraphCanvas),
  {
    loading: () => <GraphSkeleton />,
    ssr: false,
  }
);
