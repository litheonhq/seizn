"use client";

import { memo } from "react";

// Memoized skeleton components for consistent rendering
export const PanelSkeleton = memo(function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="space-y-3 mt-6">
        <div className="h-20 bg-gray-100 rounded-lg" />
        <div className="h-20 bg-gray-100 rounded-lg" />
        <div className="h-20 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
});

export const SnippetSkeleton = memo(function SnippetSkeleton() {
  return (
    <div className="bg-[var(--ink-900)] rounded-2xl overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 bg-gray-700 rounded-lg" />
          <div className="h-8 w-20 bg-[var(--ink-800)] rounded-lg" />
          <div className="h-8 w-16 bg-[var(--ink-800)] rounded-lg" />
        </div>
        <div className="h-8 w-16 bg-[var(--ink-800)] rounded-lg" />
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

export const FeatureCardSkeleton = memo(function FeatureCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 animate-pulse">
      <div className="w-10 h-10 bg-gray-100 rounded-xl mb-4" />
      <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
      </div>
    </div>
  );
});

export const SectionSkeleton = memo(function SectionSkeleton() {
  return (
    <div className="py-16 px-4 sm:px-6 bg-gray-50 animate-pulse">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-4" />
          <div className="h-4 bg-gray-100 rounded w-1/3 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureCardSkeleton />
          <FeatureCardSkeleton />
          <FeatureCardSkeleton />
          <FeatureCardSkeleton />
        </div>
      </div>
    </div>
  );
});
