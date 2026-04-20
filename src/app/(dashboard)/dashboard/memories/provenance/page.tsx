import Link from "next/link";
import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import { listGossipEvents, type GossipEvent } from "@/lib/memory/gossip";
import { listScenes, type SceneRecord } from "@/lib/memory/scenes";

export const metadata: Metadata = {
  title: "Memory Provenance - Seizn Dashboard",
  description: "Inspect scene context and gossip provenance for NPC memory recall.",
  robots: {
    index: false,
    follow: false,
  },
};

interface ProvenanceLoad {
  scenes: SceneRecord[];
  sceneError: string | null;
  gossipEvents: GossipEvent[];
  gossipError: string | null;
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function isDistorted(event: GossipEvent): boolean {
  return event.fact_original !== event.fact_transmitted;
}

async function loadProvenance(userId: string): Promise<ProvenanceLoad> {
  const supabase = createServerClient();
  const [sceneResult, gossipResult] = await Promise.allSettled([
    listScenes(supabase, { userId, namespace: "default", limit: 50 }),
    listGossipEvents(supabase, { userId, namespace: "default", limit: 50 }),
  ]);

  return {
    scenes: sceneResult.status === "fulfilled" ? sceneResult.value : [],
    sceneError:
      sceneResult.status === "rejected"
        ? sceneResult.reason instanceof Error
          ? sceneResult.reason.message
          : "scene_dashboard_load_failed"
        : null,
    gossipEvents: gossipResult.status === "fulfilled" ? gossipResult.value : [],
    gossipError:
      gossipResult.status === "rejected"
        ? gossipResult.reason instanceof Error
          ? gossipResult.reason.message
          : "gossip_dashboard_load_failed"
        : null,
  };
}

function ProvenanceSummary({ scenes, gossipEvents }: { scenes: SceneRecord[]; gossipEvents: GossipEvent[] }) {
  const activeScenes = scenes.filter((scene) => scene.ended_at === null).length;
  const entityCount = new Set(scenes.flatMap((scene) => scene.entity_ids)).size;
  const distortedCount = gossipEvents.filter(isDistorted).length;
  const averageConfidence =
    gossipEvents.length === 0
      ? 0
      : gossipEvents.reduce((sum, event) => sum + event.confidence, 0) / gossipEvents.length;

  const stats = [
    ["Scenes", scenes.length],
    ["Active", activeScenes],
    ["Entities", entityCount],
    ["Rumors", gossipEvents.length],
    ["Distorted", distortedCount],
    ["Avg confidence", confidenceLabel(averageConfidence)],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-px border-y border-szn-border-subtle bg-szn-border-subtle lg:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="bg-szn-bg p-5">
          <div className="szn-eyebrow mb-3">{label}</div>
          <div className="font-mono text-[28px] leading-none text-szn-text-1 tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-y border-dashed border-szn-border-subtle py-10">
      <p className="text-sm font-medium text-szn-text-1">{title}</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-szn-text-2">{body}</p>
    </div>
  );
}

function ErrorState({ label, migration, message }: { label: string; migration: string; message: string }) {
  return (
    <div className="border-y border-amber-300/30 bg-amber-500/10 p-6">
      <div className="szn-eyebrow mb-2 text-amber-200">{label}</div>
      <p className="text-sm text-amber-100">
        Apply the `{migration}` migration, then reload this page.
      </p>
      <p className="mt-3 font-mono text-xs text-amber-200/80">{message}</p>
    </div>
  );
}

function EntityPills({ entityIds }: { entityIds: string[] }) {
  if (entityIds.length === 0) return <span className="text-xs text-szn-text-3">no entities</span>;

  return (
    <div className="flex max-w-md flex-wrap gap-2">
      {entityIds.slice(0, 6).map((entityId) => (
        <span key={entityId} className="rounded bg-szn-surface-1 px-2 py-1 font-mono text-[11px] text-szn-text-2">
          {entityId}
        </span>
      ))}
      {entityIds.length > 6 ? (
        <span className="rounded bg-szn-signal-soft px-2 py-1 font-mono text-[11px] text-szn-signal">
          +{entityIds.length - 6}
        </span>
      ) : null}
    </div>
  );
}

function SceneTable({ scenes, error }: { scenes: SceneRecord[]; error: string | null }) {
  if (error) {
    return <ErrorState label="Scene migration pending" migration="20260421007" message={error} />;
  }

  if (scenes.length === 0) {
    return (
      <EmptyState
        title="No scenes yet"
        body="Start a bounded context through the scene API before enabling in-scene recall boosts."
      />
    );
  }

  return (
    <div className="overflow-x-auto border-y border-szn-border-subtle">
      <table className="min-w-full divide-y divide-szn-border-subtle">
        <thead>
          <tr className="bg-szn-surface-1">
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Scene</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">State</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Entities</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Outcome keys</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border-subtle">
          {scenes.map((scene) => {
            const outcomeKeys = Object.keys(scene.outcomes);

            return (
              <tr key={scene.id} className="align-top">
                <td className="px-5 py-4">
                  <div className="max-w-md text-sm font-medium text-szn-text-1">
                    {scene.summary || "Untitled scene"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-szn-text-3">{shortId(scene.id)}</div>
                  <div className="mt-2 text-xs text-szn-text-2">namespace: {scene.namespace}</div>
                </td>
                <td className="px-5 py-4">
                  {scene.ended_at ? (
                    <span className="inline-flex rounded bg-szn-surface-1 px-2 py-1 text-[11px] text-szn-text-2">
                      closed
                    </span>
                  ) : (
                    <span className="inline-flex rounded bg-szn-signal-soft px-2 py-1 text-[11px] text-szn-signal">
                      active
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <EntityPills entityIds={scene.entity_ids} />
                </td>
                <td className="px-5 py-4">
                  {outcomeKeys.length > 0 ? (
                    <div className="flex max-w-sm flex-wrap gap-2">
                      {outcomeKeys.slice(0, 4).map((key) => (
                        <span key={key} className="rounded bg-szn-surface-1 px-2 py-1 font-mono text-[11px] text-szn-text-2">
                          {key}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-szn-text-3">none</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(scene.started_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function distortionTone(event: GossipEvent): string {
  if (event.distortion_model === "none") return "bg-szn-surface-1 text-szn-text-2";
  if (isDistorted(event)) return "bg-rose-500/10 text-rose-300";
  return "bg-szn-signal-soft text-szn-signal";
}

function GossipTable({ gossipEvents, error }: { gossipEvents: GossipEvent[]; error: string | null }) {
  if (error) {
    return <ErrorState label="Gossip migration pending" migration="20260421008" message={error} />;
  }

  if (gossipEvents.length === 0) {
    return (
      <EmptyState
        title="No gossip events yet"
        body="Propagate a belief between entities to capture the original fact, transmitted rumor, and distortion model."
      />
    );
  }

  return (
    <div className="overflow-x-auto border-y border-szn-border-subtle">
      <table className="min-w-full divide-y divide-szn-border-subtle">
        <thead>
          <tr className="bg-szn-surface-1">
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Fact</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Route</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Distortion</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Confidence</th>
            <th className="px-5 py-3 text-left text-[11px] font-medium uppercase text-szn-text-3">Propagated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-szn-border-subtle">
          {gossipEvents.map((event) => (
            <tr key={event.id} className="align-top">
              <td className="px-5 py-4">
                <div className="max-w-lg text-sm text-szn-text-1">{event.fact_transmitted}</div>
                {isDistorted(event) ? (
                  <div className="mt-2 max-w-lg text-xs leading-5 text-szn-text-3">
                    original: {event.fact_original}
                  </div>
                ) : null}
                <div className="mt-2 font-mono text-xs text-szn-text-3">{shortId(event.source_belief_id)}</div>
              </td>
              <td className="px-5 py-4">
                <div className="font-mono text-xs text-szn-text-1">
                  {event.from_entity_id} -&gt; {event.to_entity_id}
                </div>
                <div className="mt-2 text-xs text-szn-text-2">channel: {event.channel}</div>
              </td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded px-2 py-1 font-mono text-[11px] ${distortionTone(event)}`}>
                  {event.distortion_model}
                </span>
                <div className="mt-2 text-xs text-szn-text-3">
                  {isDistorted(event) ? "mutated in transit" : "unchanged"}
                </div>
              </td>
              <td className="px-5 py-4 font-mono text-sm text-szn-text-1">{confidenceLabel(event.confidence)}</td>
              <td className="px-5 py-4 text-sm text-szn-text-2">{formatWhen(event.propagated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MemoryProvenancePage() {
  const authState = await getAuthOrReview();
  const data = authState.isAuthenticated
    ? await loadProvenance(authState.user.id)
    : { scenes: [], sceneError: null, gossipEvents: [], gossipError: null };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-4 flex w-fit items-center overflow-hidden rounded-lg border border-szn-border bg-szn-card">
            <Link
              href="/dashboard/memories"
              className="px-3 py-2 text-xs font-medium text-szn-text-2 transition-colors hover:bg-szn-surface-1 hover:text-szn-signal"
            >
              Memories
            </Link>
            <span className="bg-szn-signal-soft px-3 py-2 text-xs font-medium text-szn-signal">
              Provenance
            </span>
          </div>
          <p className="szn-section-number">12 / PROVENANCE LAYER</p>
          <h1 className="szn-serif mt-3 text-[clamp(34px,4vw,58px)] leading-[1.02] text-szn-text-1">
            Scene & Gossip Provenance
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-szn-text-2">
            Inspect bounded scene context, rumor distortion, and entity-to-entity fact transmission before recall behavior drifts.
          </p>
        </div>

        <ProvenanceSummary scenes={data.scenes} gossipEvents={data.gossipEvents} />

        <section className="space-y-4">
          <div>
            <p className="szn-eyebrow text-szn-signal">Scene context</p>
            <h2 className="mt-2 text-xl font-semibold text-szn-text-1">Active and completed scenes</h2>
          </div>
          <SceneTable scenes={data.scenes} error={data.sceneError} />
        </section>

        <section className="space-y-4">
          <div>
            <p className="szn-eyebrow text-szn-signal">Gossip trail</p>
            <h2 className="mt-2 text-xl font-semibold text-szn-text-1">Fact propagation</h2>
          </div>
          <GossipTable gossipEvents={data.gossipEvents} error={data.gossipError} />
        </section>
      </div>
    </DashboardShell>
  );
}
