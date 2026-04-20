"use client";

import { memo, useEffect, useRef, useCallback } from "react";
import {
  prefersReducedMotion,
  onReducedMotionChange,
} from "@/lib/a11y/reduced-motion";

// =============================================================================
// Types
// =============================================================================

interface GraphNode {
  baseX: number;
  baseY: number;
  radius: number;
  phase: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

interface GraphEdge {
  from: number;
  to: number;
  opacity: number;
  targetOpacity: number;
  nextChangeAt: number;
}

interface ThemeColors {
  primary: string;
  secondary: string;
  particle: string;
}

interface AnimState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  animFrameId: number | null;
  paused: boolean;
  startTime: number;
  lastFrameTime: number;
  themeColors: ThemeColors;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_EDGES = 15;
const DRIFT_AMPLITUDE = 0.03;
const EDGE_FADE_SPEED = 0.3;
const EDGE_CYCLE_MIN = 3000;
const EDGE_CYCLE_MAX = 8000;
const MIN_NODE_DISTANCE = 0.12;
const EDGE_DISTANCE_THRESHOLD = 0.45;
const MAX_NODE_CONNECTIONS = 3;

// Edge strips: regions around the outer edges, excluding center 40%
const STRIPS = [
  { xMin: 0.05, xMax: 0.95, yMin: 0.05, yMax: 0.25, count: 3 }, // top
  { xMin: 0.05, xMax: 0.95, yMin: 0.75, yMax: 0.95, count: 3 }, // bottom
  { xMin: 0.05, xMax: 0.25, yMin: 0.25, yMax: 0.75, count: 2 }, // left
  { xMin: 0.75, xMax: 0.95, yMin: 0.25, yMax: 0.75, count: 2 }, // right
];

// =============================================================================
// Helpers
// =============================================================================

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function parseColor(css: string): [number, number, number] {
  const trimmed = css.trim();
  // Handle hex
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }
  // Handle rgb/rgba
  const match = trimmed.match(/\d+/g);
  if (match && match.length >= 3) {
    return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
  }
  return [139, 92, 246]; // fallback: winter purple
}

// =============================================================================
// Node Generation
// =============================================================================

function generateNodes(): GraphNode[] {
  const nodes: GraphNode[] = [];

  for (const strip of STRIPS) {
    for (let i = 0; i < strip.count; i++) {
      let baseX = 0;
      let baseY = 0;
      let attempts = 0;

      // Keep generating until minimum distance is met
      do {
        baseX = rand(strip.xMin, strip.xMax);
        baseY = rand(strip.yMin, strip.yMax);
        attempts++;
      } while (
        attempts < 5 &&
        nodes.some((n) => dist(n.baseX, n.baseY, baseX, baseY) < MIN_NODE_DISTANCE)
      );

      nodes.push({
        baseX,
        baseY,
        radius: rand(4, 8),
        phase: rand(0, Math.PI * 2),
        speedX: rand(0.15, 0.35),
        speedY: rand(0.15, 0.35),
        opacity: rand(0.3, 0.6),
      });
    }
  }

  return nodes;
}

// =============================================================================
// Edge Generation
// =============================================================================

function generateEdges(nodes: GraphNode[]): GraphEdge[] {
  const pairs: { from: number; to: number; d: number }[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = dist(nodes[i].baseX, nodes[i].baseY, nodes[j].baseX, nodes[j].baseY);
      if (d < EDGE_DISTANCE_THRESHOLD) {
        pairs.push({ from: i, to: j, d });
      }
    }
  }

  pairs.sort((a, b) => a.d - b.d);

  const edges: GraphEdge[] = [];
  const connectionCount = new Map<number, number>();

  for (const pair of pairs) {
    if (edges.length >= MAX_EDGES) break;

    const fromCount = connectionCount.get(pair.from) || 0;
    const toCount = connectionCount.get(pair.to) || 0;
    if (fromCount >= MAX_NODE_CONNECTIONS || toCount >= MAX_NODE_CONNECTIONS) continue;

    const now = performance.now();
    edges.push({
      from: pair.from,
      to: pair.to,
      opacity: rand(0.1, 0.3),
      targetOpacity: rand(0.15, 0.35),
      nextChangeAt: now + rand(EDGE_CYCLE_MIN, EDGE_CYCLE_MAX),
    });

    connectionCount.set(pair.from, fromCount + 1);
    connectionCount.set(pair.to, toCount + 1);
  }

  return edges;
}

// =============================================================================
// Theme Color Reading
// =============================================================================

function readThemeColors(container: HTMLElement): ThemeColors {
  const style = getComputedStyle(container);
  // Prefer the Seizn brand signal; fall back to seasonal theme, then hardcoded plasma violet.
  const signal = style.getPropertyValue("--szn-signal").trim();
  const primary = signal || style.getPropertyValue("--theme-primary").trim() || "#A78BFA";
  const secondary = style.getPropertyValue("--theme-secondary").trim() || "#C4B5FD";
  return {
    primary,
    secondary,
    particle: style.getPropertyValue("--theme-particle-color").trim() || "rgba(167, 139, 250, 0.3)",
  };
}

// =============================================================================
// Drawing
// =============================================================================

function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: AnimState,
  w: number,
  h: number,
  time: number
) {
  ctx.clearRect(0, 0, w, h);

  const [pr, pg, pb] = parseColor(state.themeColors.primary);

  // Draw edges
  for (const edge of state.edges) {
    if (edge.opacity < 0.01) continue;

    const from = state.nodes[edge.from];
    const to = state.nodes[edge.to];
    const fx = (from.baseX + Math.sin(time * from.speedX + from.phase) * DRIFT_AMPLITUDE) * w;
    const fy = (from.baseY + Math.cos(time * from.speedY + from.phase * 1.3) * DRIFT_AMPLITUDE) * h;
    const tx = (to.baseX + Math.sin(time * to.speedX + to.phase) * DRIFT_AMPLITUDE) * w;
    const ty = (to.baseY + Math.cos(time * to.speedY + to.phase * 1.3) * DRIFT_AMPLITUDE) * h;

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${edge.opacity * 0.8})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw nodes
  for (const node of state.nodes) {
    const nx = (node.baseX + Math.sin(time * node.speedX + node.phase) * DRIFT_AMPLITUDE) * w;
    const ny = (node.baseY + Math.cos(time * node.speedY + node.phase * 1.3) * DRIFT_AMPLITUDE) * h;
    const r = node.radius;

    // Glow
    const gradient = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * 3);
    gradient.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${node.opacity * 0.4})`);
    gradient.addColorStop(0.5, `rgba(${pr}, ${pg}, ${pb}, ${node.opacity * 0.15})`);
    gradient.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);

    ctx.beginPath();
    ctx.arc(nx, ny, r * 3, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(nx, ny, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${node.opacity * 0.7})`;
    ctx.fill();
  }
}

// =============================================================================
// Component
// =============================================================================

export const HeroGraphAnimation = memo(function HeroGraphAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AnimState | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { ctx, width: rect.width, height: rect.height };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const setup = setupCanvas();
    if (!setup) return;
    const { ctx } = setup;

    // Find the nearest ancestor with theme variables
    const themeEl = container.closest("[class*='theme-']") as HTMLElement || container;
    const themeColors = readThemeColors(themeEl);

    const nodes = generateNodes();
    const edges = generateEdges(nodes);

    const state: AnimState = {
      nodes,
      edges,
      animFrameId: null,
      paused: false,
      startTime: performance.now(),
      lastFrameTime: performance.now(),
      themeColors,
    };
    stateRef.current = state;

    // Reduced motion: render one static frame only
    if (prefersReducedMotion()) {
      const rect = container.getBoundingClientRect();
      drawFrame(ctx, state, rect.width, rect.height, 0);
      return;
    }

    // Animation loop
    function tick() {
      if (!stateRef.current || stateRef.current.paused) return;
      const s = stateRef.current;
      const now = performance.now();
      const dt = (now - s.lastFrameTime) / 1000;
      s.lastFrameTime = now;

      const time = (now - s.startTime) / 1000;

      // Update edge opacities
      for (const edge of s.edges) {
        if (now >= edge.nextChangeAt) {
          // Toggle target: 60-70% visible
          edge.targetOpacity = Math.random() < 0.65 ? rand(0.15, 0.35) : 0;
          edge.nextChangeAt = now + rand(EDGE_CYCLE_MIN, EDGE_CYCLE_MAX);
        }
        edge.opacity = lerp(edge.opacity, edge.targetOpacity, Math.min(1, EDGE_FADE_SPEED * dt));
      }

      const rect = container!.getBoundingClientRect();
      drawFrame(ctx, s, rect.width, rect.height, time);

      s.animFrameId = requestAnimationFrame(tick);
    }

    state.animFrameId = requestAnimationFrame(tick);

    // Visibility change handler
    const handleVisibility = () => {
      if (!stateRef.current) return;
      if (document.hidden) {
        if (stateRef.current.animFrameId !== null) {
          cancelAnimationFrame(stateRef.current.animFrameId);
        }
        stateRef.current.paused = true;
      } else {
        stateRef.current.paused = false;
        stateRef.current.lastFrameTime = performance.now();
        stateRef.current.animFrameId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Resize handler (debounced)
    const handleResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        setupCanvas();
        // Re-read theme colors on resize (theme might have changed)
        if (stateRef.current) {
          stateRef.current.themeColors = readThemeColors(themeEl);
        }
      }, 150);
    };
    window.addEventListener("resize", handleResize, { passive: true });

    // Reduced motion change subscription
    const unsubMotion = onReducedMotionChange((reduced) => {
      if (!stateRef.current) return;
      if (reduced) {
        if (stateRef.current.animFrameId !== null) {
          cancelAnimationFrame(stateRef.current.animFrameId);
        }
        stateRef.current.paused = true;
        // Draw one static frame
        const r = container.getBoundingClientRect();
        drawFrame(ctx, stateRef.current, r.width, r.height, 0);
      } else {
        stateRef.current.paused = false;
        stateRef.current.lastFrameTime = performance.now();
        stateRef.current.animFrameId = requestAnimationFrame(tick);
      }
    });

    // Cleanup
    return () => {
      if (stateRef.current?.animFrameId !== null) {
        cancelAnimationFrame(stateRef.current!.animFrameId!);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
      unsubMotion();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      stateRef.current = null;
    };
  }, [setupCanvas]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="hero-graph-canvas"
        aria-hidden="true"
      />
    </div>
  );
});
