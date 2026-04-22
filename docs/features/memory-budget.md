# Memory Budget

Seizn memory budget tiering keeps frequently recalled memories hot while moving stale, unpinned memories to cheaper tiers.

## Tiers

- Hot: default write tier for new memories and recently recalled memories.
- Warm: stale hot memories after 30 days without recall.
- Cold: stale warm memories after 90 days without recall.

Pinned memories are never demoted automatically.

## Automation

`/api/cron/tier-demotion` runs daily behind `CRON_SECRET`. Each run processes up to 1,000 stale memories and stops before the 50 second runtime budget.

Plan gating is controlled by `memoryTiering`:

- Free and Indie: disabled; write-time demotion is skipped and memories remain hot.
- Studio, Pro, Enterprise: enabled.

## Recall Behavior

Read/search paths record recall counters through `recordRecall`. When `PROMOTE_ON_RECALL` is enabled, recalled warm or cold memories are promoted back to hot and budget usage is refreshed.

## Observability

- `memory_budget_events` records writes, recalls, demotions, and promotions.
- `/api/budget/tier-stats` returns hot, warm, cold, pinned, last demotion time, and last demotion count.
- `/api/v1/memory-budget` continues to expose entity-level budget snapshots.
