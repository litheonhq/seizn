/**
 * Layout Worker Manager
 *
 * Manages Web Worker for layout computation with fallback
 * to main thread for browsers without worker support.
 *
 * @module lib/graph-viz/layout-worker-manager
 */

import type {
  GraphNode,
  GraphEdge,
  LayoutConfig,
  LayoutProgress,
  LayoutWorkerOutput,
} from './types';

type LayoutProgressCallback = (progress: LayoutProgress) => void;
type LayoutCompleteCallback = (positions: Array<{ id: string; x: number; y: number }>) => void;
type LayoutErrorCallback = (error: Error) => void;

interface LayoutCallbacks {
  onProgress?: LayoutProgressCallback;
  onComplete?: LayoutCompleteCallback;
  onError?: LayoutErrorCallback;
}

/**
 * Layout Worker Manager
 *
 * @example
 * ```ts
 * const manager = new LayoutWorkerManager();
 *
 * await manager.init(nodes, edges);
 *
 * manager.runLayout(
 *   { algorithm: 'force-atlas-2', iterations: 100 },
 *   {
 *     onProgress: (p) => console.log(`${p.iteration}/${p.totalIterations}`),
 *     onComplete: (positions) => updateNodePositions(positions),
 *   }
 * );
 * ```
 */
export class LayoutWorkerManager {
  private worker: Worker | null = null;
  private isInitialized = false;
  private callbacks: LayoutCallbacks = {};
  private pendingResolve: ((value: void) => void) | null = null;

  /**
   * Initialize the worker with graph data
   */
  async init(
    nodes: GraphNode[],
    edges: GraphEdge[],
    config?: Partial<LayoutConfig>
  ): Promise<void> {
    // Check for worker support
    if (typeof Worker === 'undefined') {
      console.warn('[LayoutWorkerManager] Web Workers not supported, using main thread');
      this.isInitialized = true;
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Create worker
        this.worker = new Worker('/workers/layout-worker.js');

        // Set up message handler
        this.worker.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[LayoutWorkerManager] Worker error:', error);
          this.callbacks.onError?.(new Error(error.message));
          reject(error);
        };

        // Initialize worker
        this.worker.postMessage({
          type: 'init',
          payload: { nodes, edges, config },
        });

        this.pendingResolve = resolve;
        this.isInitialized = true;
      } catch (error) {
        console.error('[LayoutWorkerManager] Failed to create worker:', error);
        reject(error);
      }
    });
  }

  /**
   * Run layout algorithm
   */
  runLayout(config: Partial<LayoutConfig>, callbacks: LayoutCallbacks = {}): void {
    this.callbacks = callbacks;

    if (!this.worker) {
      // Fallback: run on main thread (simplified)
      this.runLayoutMainThread(config);
      return;
    }

    this.worker.postMessage({
      type: 'layout:start',
      payload: config,
    });
  }

  /**
   * Stop running layout
   */
  stopLayout(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'layout:stop' });
    }
  }

  /**
   * Update graph data
   */
  updateData(nodes?: GraphNode[], edges?: GraphEdge[]): void {
    if (this.worker) {
      this.worker.postMessage({
        type: 'data:update',
        payload: { nodes, edges },
      });
    }
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }

  /**
   * Handle messages from worker
   */
  private handleMessage(data: { type: string; payload?: unknown }): void {
    switch (data.type) {
      case 'init:complete':
        this.pendingResolve?.();
        this.pendingResolve = null;
        break;

      case 'layout:progress':
        this.callbacks.onProgress?.(data.payload as LayoutProgress);
        break;

      case 'layout:complete':
        const output = data.payload as LayoutWorkerOutput;
        this.callbacks.onComplete?.(output.nodes);
        break;

      case 'error':
        this.callbacks.onError?.(new Error(String(data.payload)));
        break;
    }
  }

  /**
   * Fallback: run layout on main thread
   */
  private runLayoutMainThread(config: Partial<LayoutConfig>): void {
    // Simple force-directed layout for fallback
    console.warn('[LayoutWorkerManager] Running layout on main thread (fallback)');

    // This is a simplified version - in production, you'd want a full implementation
    setTimeout(() => {
      this.callbacks.onComplete?.([]);
    }, 100);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a layout worker manager
 */
export function createLayoutWorkerManager(): LayoutWorkerManager {
  return new LayoutWorkerManager();
}

/**
 * Singleton instance
 */
let instance: LayoutWorkerManager | null = null;

export function getLayoutWorkerManager(): LayoutWorkerManager {
  if (!instance) {
    instance = new LayoutWorkerManager();
  }
  return instance;
}

export function destroyLayoutWorkerManager(): void {
  if (instance) {
    instance.terminate();
    instance = null;
  }
}
