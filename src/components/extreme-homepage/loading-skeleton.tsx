"use client";

import { memo } from "react";

export const SnippetSkeleton = memo(function SnippetSkeleton() {
  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 bg-gray-700 rounded-lg" />
          <div className="h-8 w-20 bg-gray-800 rounded-lg" />
          <div className="h-8 w-16 bg-gray-800 rounded-lg" />
        </div>
        <div className="h-8 w-16 bg-gray-800 rounded-lg" />
      </div>
      <div className="p-6 space-y-3">
        <div className="h-4 bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-700 rounded w-3/4" />
        <div className="h-4 bg-gray-700 rounded w-5/6" />
        <div className="h-4 bg-gray-700 rounded w-2/3" />
      </div>
    </div>
  );
});
