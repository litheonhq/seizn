/**
 * API Wrapper for automatic metrics collection
 * Wraps Next.js API route handlers to collect latency and status metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordMetric } from './collector';

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string | string[]> }
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap an API route handler with metrics collection
 */
export function withMetrics(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: { params?: Record<string, string | string[]> }) => {
    const startTime = performance.now();
    const pathname = request.nextUrl.pathname;
    const method = request.method;

    let response: NextResponse;
    let statusCode: number;

    try {
      response = await handler(request, context);
      statusCode = response.status;
    } catch (error) {
      // Record error metrics
      const duration = performance.now() - startTime;
      recordMetric(pathname, method, duration, 500);
      throw error;
    }

    const duration = performance.now() - startTime;
    recordMetric(pathname, method, duration, statusCode);

    return response;
  };
}

/**
 * Create a monitored GET handler
 */
export function monitoredGET(handler: RouteHandler): RouteHandler {
  return withMetrics(handler);
}

/**
 * Create a monitored POST handler
 */
export function monitoredPOST(handler: RouteHandler): RouteHandler {
  return withMetrics(handler);
}

/**
 * Create a monitored PUT handler
 */
export function monitoredPUT(handler: RouteHandler): RouteHandler {
  return withMetrics(handler);
}

/**
 * Create a monitored PATCH handler
 */
export function monitoredPATCH(handler: RouteHandler): RouteHandler {
  return withMetrics(handler);
}

/**
 * Create a monitored DELETE handler
 */
export function monitoredDELETE(handler: RouteHandler): RouteHandler {
  return withMetrics(handler);
}

/**
 * Higher-order function to create all monitored handlers at once
 */
export function createMonitoredHandlers(handlers: {
  GET?: RouteHandler;
  POST?: RouteHandler;
  PUT?: RouteHandler;
  PATCH?: RouteHandler;
  DELETE?: RouteHandler;
}) {
  const monitored: typeof handlers = {};

  if (handlers.GET) monitored.GET = withMetrics(handlers.GET);
  if (handlers.POST) monitored.POST = withMetrics(handlers.POST);
  if (handlers.PUT) monitored.PUT = withMetrics(handlers.PUT);
  if (handlers.PATCH) monitored.PATCH = withMetrics(handlers.PATCH);
  if (handlers.DELETE) monitored.DELETE = withMetrics(handlers.DELETE);

  return monitored;
}

/**
 * Manual metric recording for custom scenarios
 * Use this when you need more control over what gets recorded
 */
export function recordApiMetric(
  endpoint: string,
  method: string,
  duration: number,
  statusCode: number
): void {
  recordMetric(endpoint, method, duration, statusCode);
}

/**
 * Timer utility for manual timing
 */
export function createTimer() {
  const startTime = performance.now();

  return {
    /**
     * Get elapsed time in milliseconds
     */
    elapsed(): number {
      return performance.now() - startTime;
    },

    /**
     * Stop timer and record metric
     */
    record(endpoint: string, method: string, statusCode: number): number {
      const duration = performance.now() - startTime;
      recordMetric(endpoint, method, duration, statusCode);
      return duration;
    },
  };
}
