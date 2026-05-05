"use client";

import { useEffect, useRef } from "react";

type HeroAccent = "violet" | "cyan";
type HeroMode = "graph" | "dataflow" | "static";

const ACCENTS = {
  violet: {
    primary: "rgba(124, 58, 237, 1)",
    primarySoft: "rgba(167, 139, 250, 0.55)",
    secondary: "rgba(34, 211, 238, 0.85)",
  },
  cyan: {
    primary: "rgba(34, 211, 238, 1)",
    primarySoft: "rgba(103, 232, 249, 0.55)",
    secondary: "rgba(124, 58, 237, 0.85)",
  },
} satisfies Record<HeroAccent, { primary: string; primarySoft: string; secondary: string }>;

const SEASONS = [
  { name: "Spring", color: "rgba(52, 211, 153, 0.95)", r: 78,  speed: 0.00045 },
  { name: "Summer", color: "rgba(251, 191, 36, 0.95)", r: 130, speed: 0.00030 },
  { name: "Fall",   color: "rgba(249, 115, 22, 0.95)", r: 188, speed: -0.00022 },
  { name: "Winter", color: "rgba(96, 165, 250, 0.95)", r: 242, speed: 0.00014 },
] as const;

export function HeroGraph({
  accent = "violet",
  mode = "graph",
  width = 520,
  height = 440,
}: {
  accent?: HeroAccent;
  mode?: HeroMode;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height / 2;
    const C = ACCENTS[accent];

    type Node = {
      season: number;
      color: string;
      orbit: number;
      phase: number;
      speed: number;
      size: number;
      pulse: number;
    };
    const nodes: Node[] = [];
    SEASONS.forEach((s, si) => {
      const count = 4 + si;
      for (let i = 0; i < count; i++) {
        const phase = (i / count) * Math.PI * 2 + si * 0.7;
        nodes.push({
          season: si,
          color: s.color,
          orbit: s.r,
          phase,
          speed: s.speed,
          size: 2.6 + Math.random() * 1.6,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    });

    type Burst = { from: Node; to: Node; t: number; dur: number };
    const bursts: Burst[] = [];
    const spawnBurst = () => {
      if (nodes.length < 2) return;
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const b = nodes[Math.floor(Math.random() * nodes.length)];
      if (a === b) return;
      bursts.push({ from: a, to: b, t: 0, dur: 1400 + Math.random() * 1200 });
    };

    let lastSpawn = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      if (mode === "dataflow") {
        const cols = 14;
        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) * (width / cols);
          for (let j = 0; j < 30; j++) {
            const y = ((t * 0.06 + i * 80 + j * 28) % (height + 60)) - 30;
            const alpha = (1 - Math.abs(y - height / 2) / (height / 1.5)) * 0.7;
            ctx.fillStyle = `rgba(${i % 3 === 0 ? "124,58,237" : "34,211,238"}, ${Math.max(0, alpha) * 0.4})`;
            ctx.fillRect(x, y, 1, 14);
          }
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = C.primary;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.strokeStyle = C.primarySoft;
        ctx.lineWidth = 1;
        ctx.stroke();
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const isStatic = mode === "static";

      SEASONS.forEach((s) => {
        ctx.beginPath();
        ctx.arc(cx, cy, s.r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      const positions = nodes.map((n) => {
        const angle = n.phase + (isStatic ? 0 : n.speed * t);
        return { x: cx + Math.cos(angle) * n.orbit, y: cy + Math.sin(angle) * n.orbit, n };
      });

      ctx.lineWidth = 1;
      positions.forEach((p) => {
        const grad = ctx.createLinearGradient(cx, cy, p.x, p.y);
        grad.addColorStop(0, C.primary.replace("1)", "0.18)"));
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });

      if (!isStatic && now - lastSpawn > 380) {
        spawnBurst();
        lastSpawn = now;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += 16;
        const tt = Math.min(1, b.t / b.dur);
        if (tt >= 1) { bursts.splice(i, 1); continue; }
        const ax = cx + Math.cos(b.from.phase + b.from.speed * t) * b.from.orbit;
        const ay = cy + Math.sin(b.from.phase + b.from.speed * t) * b.from.orbit;
        const bx = cx + Math.cos(b.to.phase + b.to.speed * t) * b.to.orbit;
        const by = cy + Math.sin(b.to.phase + b.to.speed * t) * b.to.orbit;
        const px = ax + (bx - ax) * tt + (cx - (ax + bx) / 2) * Math.sin(tt * Math.PI) * 0.6;
        const py = ay + (by - ay) * tt + (cy - (ay + by) / 2) * Math.sin(tt * Math.PI) * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = C.secondary;
        ctx.shadowColor = C.secondary;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      positions.forEach((p) => {
        const pulse = isStatic ? 0.85 : 0.7 + Math.sin(t * 0.002 + p.n.pulse) * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.n.size, 0, Math.PI * 2);
        ctx.fillStyle = p.n.color.replace("0.95)", `${pulse})`);
        ctx.shadowColor = p.n.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = C.primary;
      ctx.shadowColor = C.primary;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = C.primarySoft;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (!isStatic) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [accent, mode, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
      aria-hidden
    />
  );
}
