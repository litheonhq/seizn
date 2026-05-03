"use client";

import type { WorkflowRun } from "@/types/operations";

interface WorkflowRunnerProps {
  run: WorkflowRun;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFailOne?: () => void;
}

export function WorkflowRunner({
  run,
  onStart,
  onPause,
  onResume,
  onFailOne,
}: WorkflowRunnerProps) {
  return (
    <section className="szn-card" aria-label="Workflow runner">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="szn-card-title mb-0">{run.title}</h2>
        <StateBadge state={run.state} />
      </div>

      {/* Action buttons */}
      <div className="szn-row mb-4">
        <button
          className="szn-btn szn-btn-primary"
          type="button"
          onClick={onStart}
          disabled={run.state === "running"}
        >
          Start
        </button>
        <button
          className="szn-btn szn-btn-secondary"
          type="button"
          onClick={onPause}
          disabled={run.state !== "running"}
        >
          Pause
        </button>
        <button
          className="szn-btn szn-btn-secondary"
          type="button"
          onClick={onResume}
          disabled={run.state !== "paused"}
        >
          Resume
        </button>
        {onFailOne && (
          <button
            className="szn-btn szn-btn-danger"
            type="button"
            onClick={onFailOne}
          >
            Simulate failure
          </button>
        )}
      </div>

      {/* Step list */}
      <ol className="szn-list">
        {run.steps.map((step) => (
          <li key={step.id} className={`szn-step szn-step-${step.status}`}>
            <span className="text-sm">{step.label}</span>
            <StepStatusBadge status={step.status} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StateBadge({ state }: { state: WorkflowRun["state"] }) {
  const styles: Record<WorkflowRun["state"], string> = {
    idle: "bg-[var(--ink-100)] text-[var(--ink-500)]",
    running: "bg-[var(--ink-900)]/10 text-[var(--ink-900)]",
    paused: "bg-[var(--signal-pending)]/10 text-[var(--signal-pending-soft)]",
    done: "bg-[var(--signal-canon)]/10 text-green-400",
    failed: "bg-[var(--signal-conflict)]/10 text-[var(--signal-conflict-soft)]",
  };

  return (
    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${styles[state]}`}>
      {state}
    </span>
  );
}

function StepStatusBadge({ status }: { status: "pending" | "running" | "done" | "failed" }) {
  const styles: Record<typeof status, string> = {
    pending: "text-[var(--ink-500)]",
    running: "text-[var(--ink-900)] font-semibold",
    done: "text-green-400 font-semibold",
    failed: "text-[var(--signal-conflict-soft)] font-semibold",
  };

  return <strong className={`text-xs ${styles[status]}`}>{status}</strong>;
}
