'use client';

/**
 * Feature Flags Debug Panel
 *
 * Debug panel for viewing and overriding feature flags in development.
 *
 * @module components/feature-flags/debug-panel
 */

import { useState, useEffect } from 'react';
import { useFeatureFlags } from '@/lib/feature-flags';
import type { FlagKey } from '@/lib/feature-flags';

// =============================================================================
// Types
// =============================================================================

interface DebugPanelProps {
  /** Position of the panel */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Only show in development */
  devOnly?: boolean;
}

// =============================================================================
// Flag Definition
// =============================================================================

// Known flags for the debug panel
const KNOWN_FLAGS: Array<{
  key: FlagKey;
  label: string;
  type: 'boolean' | 'variant';
  variants?: string[];
}> = [
  { key: 'new-dashboard-layout', label: 'New Dashboard Layout', type: 'boolean' },
  { key: 'dark-mode-v2', label: 'Dark Mode v2', type: 'boolean' },
  { key: 'mindmap-webgl', label: 'MindMap WebGL', type: 'boolean' },
  { key: 'memory-v4-search', label: 'Memory v4 Search', type: 'boolean' },
  { key: 'graph-expansion', label: 'Graph Expansion', type: 'boolean' },
  { key: 'community-detection', label: 'Community Detection', type: 'boolean' },
  {
    key: 'onboarding-flow',
    label: 'Onboarding Flow',
    type: 'variant',
    variants: ['control', 'variant-a', 'variant-b'],
  },
  {
    key: 'search-algorithm',
    label: 'Search Algorithm',
    type: 'variant',
    variants: ['default', 'hybrid', 'graph-first'],
  },
  { key: 'beta-connectors', label: 'Beta: Connectors', type: 'boolean' },
  { key: 'beta-voice-input', label: 'Beta: Voice Input', type: 'boolean' },
  { key: 'beta-collaboration', label: 'Beta: Collaboration', type: 'boolean' },
];

// =============================================================================
// Component
// =============================================================================

export function FeatureFlagsDebugPanel({
  position = 'bottom-right',
  defaultCollapsed = true,
  devOnly = true,
}: DebugPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [mounted, setMounted] = useState(false);
  const { isReady, getFlag, setOverride, clearOverride, reloadFlags } = useFeatureFlags();

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Don't render in production if devOnly
  if (devOnly && process.env.NODE_ENV === 'production') {
    return null;
  }

  // Don't render on server
  if (!mounted) {
    return null;
  }

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50`}
      style={{ maxHeight: '80vh' }}
    >
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className="bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          title="Open Feature Flags Debug Panel"
        >
          🚩 Flags
        </button>
      ) : (
        <div className="bg-szn-bg rounded-lg shadow-2xl border border-szn-border w-80 overflow-hidden">
          {/* Header */}
          <div className="bg-purple-600 text-white px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Feature Flags</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={reloadFlags}
                className="text-white/80 hover:text-white text-xs"
                title="Reload Flags"
              >
                🔄
              </button>
              <button
                onClick={() => setIsCollapsed(true)}
                className="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="px-4 py-2 bg-szn-surface text-xs text-szn-text-2 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isReady ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            {isReady ? 'Connected' : 'Loading...'}
          </div>

          {/* Flags List */}
          <div className="max-h-96 overflow-y-auto">
            {KNOWN_FLAGS.map((flag) => (
              <FlagRow
                key={flag.key}
                flag={flag}
                value={getFlag(flag.key)}
                onOverride={(value) => setOverride(flag.key, value as never)}
                onClear={() => clearOverride(flag.key)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-szn-surface border-t border-szn-border">
            <p className="text-xs text-szn-text-2">
              Overrides are local only
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Flag Row Component
// =============================================================================

interface FlagRowProps {
  flag: {
    key: FlagKey;
    label: string;
    type: 'boolean' | 'variant';
    variants?: string[];
  };
  value: unknown;
  onOverride: (value: boolean | string) => void;
  onClear: () => void;
}

function FlagRow({ flag, value, onOverride, onClear }: FlagRowProps) {
  const [isOverridden, setIsOverridden] = useState(false);

  const handleToggle = () => {
    if (flag.type === 'boolean') {
      onOverride(!value);
      setIsOverridden(true);
    }
  };

  const handleVariantChange = (variant: string) => {
    onOverride(variant);
    setIsOverridden(true);
  };

  const handleClear = () => {
    onClear();
    setIsOverridden(false);
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-szn-text-1">
          {flag.label}
        </span>
        {isOverridden && (
          <button
            onClick={handleClear}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <code className="text-xs text-szn-text-2">
          {flag.key}
        </code>

        {flag.type === 'boolean' ? (
          <button
            onClick={handleToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              value ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                value ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        ) : (
          <select
            value={(value as string) || 'control'}
            onChange={(e) => handleVariantChange(e.target.value)}
            className="text-xs border border-szn-border rounded px-2 py-1 bg-szn-card text-szn-text-1"
          >
            {flag.variants?.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        )}
      </div>

      {isOverridden && (
        <div className="mt-1">
          <span className="text-xs text-orange-500">⚠️ Overridden</span>
        </div>
      )}
    </div>
  );
}

export default FeatureFlagsDebugPanel;
