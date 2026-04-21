import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { resolveMemoryBudgetOrganizationId } from "@/lib/memory/budget";
import { getStoryHealthAct } from "@/lib/story-health/metrics";
import {
  STORY_HEALTH_METRICS,
  type StoryHealthMetricKey,
  type StoryHealthSnapshot,
} from "@/lib/story-health/types";
import { createServerClient } from "@/lib/supabase";
import { ActStoryHealthClient } from "./act-client";

export const metadata: Metadata = {
  title: "Story Health Act | Seizn Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

interface StoryHealthActPageProps {
  params: Promise<{ act: string }>;
  searchParams?: Promise<{ metric?: string }>;
}

function decodeAct(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeMetric(value: string | undefined): StoryHealthMetricKey | null {
  const keys = STORY_HEALTH_METRICS.map((metric) => metric.key);
  return keys.includes(value as StoryHealthMetricKey) ? (value as StoryHealthMetricKey) : null;
}

export default async function StoryHealthActPage({ params, searchParams }: StoryHealthActPageProps) {
  const { act: rawAct } = await params;
  const query = searchParams ? await searchParams : {};
  const act = decodeAct(rawAct);
  const selectedMetric = normalizeMetric(query.metric);
  const authState = await getAuthOrReview();
  let snapshots: StoryHealthSnapshot[] = [];
  let loadError: string | null = null;

  if (authState.isAuthenticated) {
    const supabase = createServerClient();
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authState.user.id,
      keyId: null,
    });

    if (organizationId) {
      try {
        snapshots = await getStoryHealthAct(organizationId, act, supabase, 45);
      } catch (error) {
        loadError = error instanceof Error ? error.message : "story_health_act_unavailable";
      }
    } else {
      loadError = "organization_required";
    }
  } else {
    loadError = "login_required";
  }

  return (
    <DashboardShell>
      <ActStoryHealthClient
        act={act}
        snapshots={snapshots}
        selectedMetric={selectedMetric}
        loadError={loadError}
      />
    </DashboardShell>
  );
}
