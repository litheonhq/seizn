# Competitor Import Mapping

Seizn imports competitor exports through a two-step job: preview first, then commit. The preview stores a normalized payload in `import_jobs`; commit writes rows to Seizn tables and stores inserted IDs for rollback.

## Inworld

| Inworld field | Seizn target | Notes |
| --- | --- | --- |
| `knowledge`, `knowledgeRecords`, `facts`, `memories` | `memories` | Imported as `memory_type = fact`, namespace `import/inworld`, tagged `import,inworld,knowledge`. |
| `characters[].knowledge` | `memories` | The character `id` or `name` becomes `agent_id` and `companion_meta.npc_id`. |
| `goals`, `instructions`, `objectives` | `canon_locks` | Imported as `scope = must_know`, `severity = hard`. |
| `characters[].goals` | `canon_locks` | Character-scoped goals become NPC-scoped canon locks. |

## Convai

| Convai field | Seizn target | Notes |
| --- | --- | --- |
| `character.backstory`, `backstory`, `bio` | `memories` | Backstory paragraphs/sentences become fact memories in namespace `import/convai`. |
| `character.tagline`, `tagline`, `greeting` | `canon_locks` | Imported as `scope = always_say`, `severity = soft`. |

## Rivet

| Rivet field | Seizn target | Notes |
| --- | --- | --- |
| `nodes`, `graph.nodes`, `graphNodes` | `belief_shards` | Each node creates a backing `memories` row with `memory_type = belief`, then a `belief_shards` row pointing to that memory. |
| `node.holderEntityId`, `node.npcId`, `node.characterId` | `belief_shards.holder_entity_id` | Falls back to node `id` when no explicit holder exists. |
| `node.confidence` | `belief_shards.confidence` | Clamped to `0..1`; default `0.82`. |

## Rollback

Rollback does not hard-delete data. It marks imported memories as deleted, deactivates imported canon locks, revokes imported belief shards, and marks the `import_jobs` row as `rolled_back`.
