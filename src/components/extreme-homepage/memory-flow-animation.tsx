"use client";

import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Search,
  Cpu,
  Database,
  ArrowUpDown,
  Activity,
  CheckCircle,
} from "lucide-react";
import { prefersReducedMotion } from "@/lib/a11y/reduced-motion";

// =============================================================================
// Pipeline Step Data
// =============================================================================

interface PipelineStep {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "query", label: "Query", description: "Natural language input from the agent", icon: Search },
  { id: "embed", label: "Embed", description: "Convert text to vector embeddings", icon: Cpu },
  { id: "search", label: "Search", description: "Retrieve candidates from vector store", icon: Database },
  { id: "rerank", label: "Rerank", description: "Cross-encoder re-scoring for precision", icon: ArrowUpDown },
  { id: "trace", label: "Trace", description: "Record latency, cost, and policy compliance", icon: Activity },
  { id: "result", label: "Result", description: "Governed, auditable response returned", icon: CheckCircle },
];

const STEP_INTERVAL = 700;
const PAUSE_AFTER = 800;
const TOTAL_CYCLE = STEP_INTERVAL * PIPELINE_STEPS.length + PAUSE_AFTER;

// =============================================================================
// FlowNode Sub-component
// =============================================================================

const FlowNode = memo(function FlowNode({
  step,
  index,
  isActive,
  isCurrent,
  nodeRef,
}: {
  step: PipelineStep;
  index: number;
  isActive: boolean;
  isCurrent: boolean;
  nodeRef: (el: HTMLDivElement | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = step.icon;

  return (
    <div
      ref={nodeRef}
      className="relative flex flex-col items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      role="listitem"
      tabIndex={0}
      aria-label={`Step ${index + 1}: ${step.label} — ${step.description}`}
    >
      {/* Node card */}
      <div
        className={[
          "szn-card rounded-xl p-2.5 sm:p-3 md:p-4",
          "flex flex-col items-center gap-1.5 sm:gap-2",
          "transition-all duration-300 ease-out",
          "cursor-default select-none border",
          isActive
            ? "border-[color:var(--theme-primary)] theme-shadow"
            : "border-transparent",
          isCurrent ? "animate-flow-activate" : "",
          isHovered ? "scale-105" : "",
        ].join(" ")}
        style={{
          willChange: isCurrent ? "box-shadow, border-color" : "auto",
        }}
      >
        {/* Icon */}
        <div
          className={[
            "w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center",
            "transition-colors duration-300",
            isActive
              ? "bg-[color:var(--theme-primary)]/10 text-[color:var(--theme-primary)]"
              : "bg-szn-surface text-szn-text-3",
          ].join(" ")}
        >
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>

        {/* Label */}
        <span
          className={[
            "text-[11px] sm:text-xs md:text-sm font-medium transition-colors duration-300",
            isActive
              ? "theme-gradient-text"
              : "text-szn-text-3",
          ].join(" ")}
        >
          {step.label}
        </span>
      </div>

      {/* Step number badge */}
      <span
        className={[
          "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px]",
          "flex items-center justify-center font-bold leading-none",
          "transition-all duration-300",
          isActive
            ? "bg-[color:var(--theme-primary)] text-white scale-100"
            : "bg-szn-surface text-szn-text-3 scale-75",
        ].join(" ")}
      >
        {index + 1}
      </span>

      {/* Tooltip on hover */}
      {isHovered && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-20 szn-card rounded-lg px-3 py-2 text-xs text-szn-text-2 w-max max-w-[200px] text-center animate-fade-in pointer-events-none"
          role="tooltip"
        >
          {step.description}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// MemoryFlowAnimation
// =============================================================================

export const MemoryFlowAnimation = memo(function MemoryFlowAnimation() {
  const [activeStep, setActiveStep] = useState(-1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);

  // Animation loop
  useEffect(() => {
    const prefers = prefersReducedMotion();
    const motionId = setTimeout(() => setReducedMotion(prefers), 0);

    if (prefers) {
      const id = setTimeout(() => setActiveStep(PIPELINE_STEPS.length - 1), 0);
      return () => {
        clearTimeout(motionId);
        clearTimeout(id);
      };
    }

    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) % TOTAL_CYCLE;
      const stepIndex = Math.floor(elapsed / STEP_INTERVAL);
      if (stepIndex < PIPELINE_STEPS.length) {
        setActiveStep(stepIndex);
      }
    }, 100);

    return () => {
      clearTimeout(motionId);
      clearInterval(interval);
    };
  }, []);

  // Calculate SVG connector paths
  const calculatePaths = useCallback(() => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newPaths: string[] = [];

    for (let i = 0; i < PIPELINE_STEPS.length - 1; i++) {
      const fromNode = nodeRefs.current[i];
      const toNode = nodeRefs.current[i + 1];
      if (!fromNode || !toNode) continue;

      const fromRect = fromNode.getBoundingClientRect();
      const toRect = toNode.getBoundingClientRect();

      const x1 = fromRect.right - containerRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
      const x2 = toRect.left - containerRect.left;
      const y2 = toRect.top + toRect.height / 2 - containerRect.top;

      if (Math.abs(y2 - y1) > 10) {
        // Nodes on different rows — S-curve connector
        const midY = (y1 + y2) / 2;
        newPaths.push(
          `M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x1 + 20} ${midY}, ${(x1 + x2) / 2} ${midY} S ${x2 - 20} ${y2}, ${x2} ${y2}`
        );
      } else {
        // Same row — horizontal bezier
        const midX = (x1 + x2) / 2;
        newPaths.push(
          `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
        );
      }
    }

    setPaths(newPaths);
  }, []);

  useEffect(() => {
    // Initial calculation after mount
    const timer = setTimeout(calculatePaths, 50);

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculatePaths, 150);
    };

    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [calculatePaths]);

  const isStepActive = useCallback(
    (index: number) => index <= activeStep,
    [activeStep]
  );

  const isStepCurrent = useCallback(
    (index: number) => index === activeStep,
    [activeStep]
  );

  const setNodeRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      nodeRefs.current[index] = el;
    },
    []
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl mx-auto">
      {/* Screen-reader description */}
      <p className="sr-only">
        AI memory pipeline: Query is embedded into vectors, searched against the
        vector store, reranked for precision, traced for observability, and
        returned as a governed result.
      </p>

      {/* SVG connector layer */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity="0.2" />
            <stop offset="50%" stopColor="var(--theme-secondary)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {paths.map((d, i) => (
          <g key={i}>
            {/* Background connector line */}
            <path
              d={d}
              fill="none"
              stroke="url(#flow-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              className="transition-opacity duration-400"
              style={{ opacity: isStepActive(i + 1) ? 0.8 : 0.15 }}
            />

            {/* Animated dash overlay */}
            {isStepActive(i + 1) && (
              <path
                d={d}
                fill="none"
                stroke="var(--theme-primary)"
                strokeWidth="2"
                strokeDasharray="5,5"
                className="animate-dash"
                style={{ opacity: 0.35 }}
              />
            )}

            {/* Data particle */}
            {isStepActive(i + 1) && !reducedMotion && (
              <circle
                r="3"
                fill="var(--theme-primary)"
                className="flow-particle"
                style={{
                  offsetPath: `path('${d}')`,
                  animation: "flow-particle-continuous 1.2s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                  willChange: "offset-distance, opacity",
                }}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Node grid */}
      <div
        className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-2 relative z-10"
        role="list"
        aria-label="AI Memory Pipeline Steps"
      >
        {PIPELINE_STEPS.map((step, index) => (
          <FlowNode
            key={step.id}
            step={step}
            index={index}
            isActive={isStepActive(index)}
            isCurrent={isStepCurrent(index)}
            nodeRef={setNodeRef(index)}
          />
        ))}
      </div>
    </div>
  );
});
