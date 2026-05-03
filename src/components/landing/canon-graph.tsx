import { getArray, getString, type SaebyeokDemoData } from "@/lib/sample-ip-demo";

const GRAPH_NODES = [
  { fallback: "Han Iseul", role: "protagonist", x: 0.22, y: 0.30, r: 30 },
  { fallback: "Jeong Serin", role: "co-lead", x: 0.62, y: 0.18, r: 26 },
  { fallback: "Yun Hana", role: "supporting", x: 0.84, y: 0.42, r: 24 },
  { fallback: "Park Jio", role: "supporting", x: 0.30, y: 0.74, r: 22 },
  { fallback: "Choe Doyun", role: "antagonist", x: 0.70, y: 0.70, r: 26 },
  { fallback: "Kim Minchae", role: "supporting", x: 0.52, y: 0.50, r: 20 },
] as const;

const GRAPH_EDGES = [
  { from: 0, to: 1, kind: "canon" },
  { from: 0, to: 5, kind: "canon" },
  { from: 1, to: 2, kind: "canon" },
  { from: 1, to: 5, kind: "pending" },
  { from: 5, to: 4, kind: "conflict" },
  { from: 3, to: 0, kind: "canon" },
  { from: 3, to: 4, kind: "pending" },
  { from: 2, to: 4, kind: "canon" },
] as const;

function edgeColor(kind: string, tone: "dark" | "light") {
  if (kind === "conflict") return "var(--signal-conflict)";
  if (kind === "pending") return "var(--signal-pending)";
  return tone === "dark" ? "oklch(1 0 0 / 0.28)" : "var(--ink-300)";
}

export function CanonGraph({
  data,
  tone = "dark",
  compact = false,
}: {
  data: SaebyeokDemoData;
  tone?: "dark" | "light";
  compact?: boolean;
}) {
  const characters = getArray(data.canon, "characters");
  const width = compact ? 420 : 560;
  const height = compact ? 360 : 460;
  const isDark = tone === "dark";
  const nodeBg = isDark ? "var(--ink-800)" : "var(--ink-0)";
  const nodeBorder = isDark ? "oklch(1 0 0 / 0.18)" : "var(--ink-200)";
  const nodeText = isDark ? "var(--ink-0)" : "var(--ink-900)";
  const subText = isDark ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)";

  return (
    <div
      className="relative aspect-[560/460] w-full overflow-hidden rounded-[var(--radius-lg)] border"
      data-testid="canon-graph"
      style={{
        maxWidth: width,
        background: isDark ? "var(--ink-900)" : "var(--ink-0)",
        borderColor: isDark ? "oklch(1 0 0 / 0.08)" : "var(--ink-100)",
        boxShadow: isDark ? "inset 0 1px 0 oklch(1 0 0 / 0.05)" : "var(--shadow-sm)",
      }}
    >
      <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-3">
        <span
          className="author-badge"
          style={{
            background: isDark ? "oklch(1 0 0 / 0.06)" : "var(--ink-100)",
            border: isDark ? "1px solid oklch(1 0 0 / 0.08)" : "1px solid var(--ink-100)",
            color: isDark ? "oklch(1 0 0 / 0.84)" : "var(--ink-700)",
          }}
        >
          <span className="author-badge-dot" style={{ color: "var(--signal-canon)" }} />
          canon graph D30
        </span>
        <span className="author-mono text-[11px]" style={{ color: subText }}>
          {GRAPH_NODES.length} nodes / {GRAPH_EDGES.length} links
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {GRAPH_EDGES.map((edge, index) => {
          const a = GRAPH_NODES[edge.from];
          const b = GRAPH_NODES[edge.to];
          return (
            <line
              key={`${edge.from}-${edge.to}-${index}`}
              x1={a.x * width}
              y1={a.y * height}
              x2={b.x * width}
              y2={b.y * height}
              stroke={edgeColor(edge.kind, tone)}
              strokeWidth={edge.kind === "conflict" ? 1.7 : 1.1}
              strokeDasharray={edge.kind === "pending" ? "4 4" : undefined}
              opacity={edge.kind === "conflict" ? 0.9 : 0.58}
            />
          );
        })}
      </svg>

      {GRAPH_NODES.map((node, index) => {
        const character = characters[index];
        const label = getString(character, "name_romanized", node.fallback);
        const cx = node.x * width;
        const cy = node.y * height;

        return (
          <div
            key={`${node.fallback}-${index}`}
            className="absolute z-20 flex items-center justify-center rounded-full border text-center"
            style={{
              left: `${((cx - node.r) / width) * 100}%`,
              top: `${((cy - node.r) / height) * 100}%`,
              width: node.r * 2,
              height: node.r * 2,
              background: nodeBg,
              borderColor: nodeBorder,
              color: nodeText,
              boxShadow: "0 0 0 6px transparent",
            }}
            title={`${label}, ${node.role}`}
          >
            <span className="px-1 text-[10px] font-medium leading-tight md:text-[11px]">{label}</span>
          </div>
        );
      })}

      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <LegendDot label="canon" color="var(--signal-canon)" tone={tone} />
          <LegendDot label="pending" color="var(--signal-pending)" tone={tone} />
          <LegendDot label="conflict" color="var(--signal-conflict)" tone={tone} />
        </div>
        <span className="author-mono text-[10px]" style={{ color: subText }}>
          saebyeok synthetic demo
        </span>
      </div>
    </div>
  );
}

function LegendDot({ label, color, tone }: { label: string; color: string; tone: "dark" | "light" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="author-mono text-[10px]" style={{ color: tone === "dark" ? "oklch(1 0 0 / 0.70)" : "var(--ink-600)" }}>
        {label}
      </span>
    </span>
  );
}
