# Replay

Seizn Replay captures deterministic execution evidence for memory workflows. A replay snapshot stores memory reads, memory writes, LLM/tool inputs, tool outputs, latency, seed metadata, and stable content hashes.

## What It Provides

- Tool stubs for LLM and external calls, keyed by canonical input hashes.
- Server-side rerun API at `/api/replay/[snapshotId]/rerun`.
- Diff API at `/api/replay/[snapshotId]/diff`.
- Plan gate: reruns require a Pro or Enterprise plan.

## Workflow

1. Run a memory workflow with replay capture enabled.
2. Store the snapshot and tool stubs in `replay_snapshots`.
3. Call the rerun API to re-execute from stored stubs.
4. Compare original and rerun outputs with `replay_diffs`.

## Limitations

- Replay does not call live external APIs in replay mode.
- Missing tool stubs fail closed with a replay stub error.
- The current batch ships API support only; visual diff UI is deferred.
