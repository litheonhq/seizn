'use client';

/**
 * useTelemetry Hook
 *
 * React hook for browser telemetry integration.
 *
 * @module hooks/useTelemetry
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  initTelemetry,
  getTelemetry,
  startSpan,
  endSpan,
  recordMetric,
  trackInteraction,
  trackError,
  type TelemetryConfig,
} from '@/lib/telemetry/browser-telemetry';

// =============================================================================
// useTelemetry
// =============================================================================

export interface UseTelemetryOptions {
  /** Auto-initialize telemetry */
  autoInit?: boolean;
  /** Telemetry configuration */
  config?: TelemetryConfig;
}

/**
 * Hook for browser telemetry
 *
 * @example
 * ```tsx
 * function App() {
 *   const { trackInteraction, trackError } = useTelemetry();
 *
 *   const handleClick = () => {
 *     trackInteraction('click', 'save-button');
 *     // ... handle click
 *   };
 *
 *   return <button onClick={handleClick}>Save</button>;
 * }
 * ```
 */
export function useTelemetry(options: UseTelemetryOptions = {}) {
  const { autoInit = true, config } = options;
  const initializedRef = useRef(false);

  useEffect(() => {
    if (autoInit && !initializedRef.current) {
      initializedRef.current = true;
      initTelemetry(config);
    }
  }, [autoInit, config]);

  return {
    startSpan,
    endSpan,
    recordMetric,
    trackInteraction,
    trackError,
    getTelemetry,
  };
}

// =============================================================================
// usePageViewTelemetry
// =============================================================================

export interface UsePageViewOptions {
  /** Page name for tracking */
  pageName: string;
  /** Additional attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Hook for tracking page views
 *
 * @example
 * ```tsx
 * function DashboardPage() {
 *   usePageViewTelemetry({ pageName: 'dashboard' });
 *   return <div>Dashboard</div>;
 * }
 * ```
 */
export function usePageViewTelemetry(options: UsePageViewOptions) {
  const { pageName, attributes } = options;

  useEffect(() => {
    const telemetry = getTelemetry();
    if (telemetry) {
      recordMetric('page_view', 1, 'count', {
        page: pageName,
        url: typeof window !== 'undefined' ? window.location.pathname : '',
        ...attributes,
      });
    }
  }, [pageName, attributes]);
}

// =============================================================================
// useSpan
// =============================================================================

export interface UseSpanOptions {
  /** Span name */
  name: string;
  /** Additional attributes */
  attributes?: Record<string, unknown>;
  /** Auto-end span on unmount */
  autoEnd?: boolean;
}

/**
 * Hook for managing a span lifecycle
 *
 * @example
 * ```tsx
 * function DataLoader() {
 *   const { getSpanId, addEvent, endWithStatus } = useSpan({
 *     name: 'data-load',
 *     autoEnd: true,
 *   });
 *
 *   useEffect(() => {
 *     addEvent('fetch-start');
 *     fetchData()
 *       .then(() => endWithStatus('ok'))
 *       .catch(() => endWithStatus('error'));
 *   }, []);
 *
 *   return <div>Loading...</div>;
 * }
 * ```
 */
export function useSpan(options: UseSpanOptions) {
  const { name, attributes, autoEnd = true } = options;
  const spanIdRef = useRef<string>('');

  useEffect(() => {
    spanIdRef.current = startSpan(name, attributes);

    return () => {
      if (autoEnd && spanIdRef.current) {
        endSpan(spanIdRef.current);
      }
    };
  }, [name, attributes, autoEnd]);

  const addEvent = useCallback(
    (eventName: string, eventAttributes?: Record<string, unknown>) => {
      const telemetry = getTelemetry();
      if (telemetry && spanIdRef.current) {
        telemetry.addEvent(spanIdRef.current, eventName, eventAttributes);
      }
    },
    []
  );

  const endWithStatus = useCallback((status: 'ok' | 'error') => {
    if (spanIdRef.current) {
      endSpan(spanIdRef.current, status);
      spanIdRef.current = '';
    }
  }, []);

  const getSpanId = useCallback(() => spanIdRef.current, []);

  return {
    getSpanId,
    addEvent,
    endWithStatus,
  };
}

// =============================================================================
// useErrorBoundaryTelemetry
// =============================================================================

/**
 * Hook for tracking errors in error boundaries
 *
 * @example
 * ```tsx
 * class ErrorBoundary extends React.Component {
 *   componentDidCatch(error, info) {
 *     trackErrorBoundary(error, info);
 *   }
 * }
 * ```
 */
export function useErrorBoundaryTelemetry() {
  const trackErrorBoundary = useCallback(
    (error: Error, errorInfo?: { componentStack?: string }) => {
      trackError(error, {
        type: 'error_boundary',
        componentStack: errorInfo?.componentStack?.slice(0, 1000),
      });
    },
    []
  );

  return { trackErrorBoundary };
}

// =============================================================================
// useInteractionTelemetry
// =============================================================================

export interface UseInteractionTelemetryOptions {
  /** Component or feature name */
  component: string;
}

/**
 * Hook for tracking user interactions within a component
 *
 * @example
 * ```tsx
 * function MemoryCard({ memory }) {
 *   const { track } = useInteractionTelemetry({ component: 'memory-card' });
 *
 *   return (
 *     <div onClick={() => track('click', 'card')}>
 *       <button onClick={() => track('click', 'edit')}>Edit</button>
 *       <button onClick={() => track('click', 'delete')}>Delete</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useInteractionTelemetry(options: UseInteractionTelemetryOptions) {
  const { component } = options;

  const track = useCallback(
    (type: string, target: string, attributes?: Record<string, unknown>) => {
      trackInteraction(type, `${component}.${target}`, attributes);
    },
    [component]
  );

  return { track };
}
