export type PostMortemStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface PostMortemCanonViolation {
  id: string;
  severity: string;
  npcId: string | null;
  sessionId: string | null;
  attemptedContent: string;
  createdAt: string;
}

export interface PostMortemChaosFinding {
  id: string;
  category: string;
  severity: string;
  npcId: string | null;
  prompt: string;
  replayTraceId: string | null;
  createdAt: string;
}

export interface PostMortemReplaySummary {
  traceId: string;
  endpoint: string;
  durationMs: number;
  createdAt: string;
}

export interface PostMortemStoryPoint {
  act: string;
  snapshotDate: string;
  consistencyScore: number;
  canonDensity: number;
  contradictionRate: number;
  engagementProxy: number;
}

export interface PostMortemUsageSummary {
  dimension: 'memories' | 'ops';
  plan: string;
  cycleStart: string;
  total: number;
  included: number | null;
  billable: number;
  reported: number;
  forecastCents: number;
}

export interface PostMortemCreditUsage {
  plan: string;
  quarter: string;
  creditsGranted: number;
  creditsUsed: number;
  status: 'included' | 'unlimited' | 'paid_after_credits';
}

export interface PostMortemReportPayload {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  replayCount: number;
  canonViolations: PostMortemCanonViolation[];
  chaosFindings: PostMortemChaosFinding[];
  storyHealth: PostMortemStoryPoint[];
  usage: PostMortemUsageSummary[];
  creditUsage: PostMortemCreditUsage;
  replaySamples: PostMortemReplaySummary[];
}

export interface PostMortemReportRecord {
  id: string;
  studioId: string;
  title: string;
  status: PostMortemStatus;
  windowStart: string;
  windowEnd: string;
  publicToken: string;
  reportPayload: PostMortemReportPayload;
  executiveSummary: string[];
  recommendations: string[];
  storyChartPngBase64: string | null;
  pdfStoragePath: string | null;
  pdfSizeBytes: number;
  notifyEmail: string | null;
  createdBy: string | null;
  generatedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
