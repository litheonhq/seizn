export type SeiznView = "home" | "operations" | "alerts" | "workflows";

export interface MetricCard {
  id: string;
  label: string;
  value: string;
  trend?: string;
}

export interface AlertItem {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface WorkflowRun {
  id: string;
  title: string;
  state: "idle" | "running" | "paused" | "done" | "failed";
  steps: WorkflowStep[];
}

export interface RiskModal {
  open: boolean;
  title: string;
  impacts: string[];
  rollback: string[];
}
