# Belief Shards Twist Demo

Fixture:

- Fact memory: `11111111-1111-4111-8111-111111111111` = "The queen is the masked captain."
- `npc_detective` has a direct belief shard for `11111111-1111-4111-8111-111111111111` after witnessing the reveal.
- `npc_guard` has no belief shard for `11111111-1111-4111-8111-111111111111`.

Expected recall:

| Perspective | Query | Result |
| --- | --- | --- |
| `npc_detective` | `masked captain` | Includes `11111111-1111-4111-8111-111111111111` |
| `npc_guard` | `masked captain` | Excludes `11111111-1111-4111-8111-111111111111` with `no_belief` |

API sketch:

```http
POST /api/v1/beliefs
{
  "holder_entity_id": "npc_detective",
  "about_fact_id": "11111111-1111-4111-8111-111111111111",
  "source_type": "direct",
  "confidence": 1
}
```

```http
POST /api/v1/memories.recall
{
  "query": "masked captain",
  "perspective_entity_id": "npc_guard",
  "top_k": 5
}
```

This prevents an NPC from spoiling the twist unless that NPC has an active belief shard for the twist fact.
