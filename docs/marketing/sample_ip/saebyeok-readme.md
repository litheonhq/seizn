---
doc_type: sample-ip-readme
version: v2
generated_at: 2026-05-02
ip_label: Sample IP - Synthetic Demo Data
ip_title: Saebyeok Academy
status: handoff-ready
applies_to: seizn.com landing live demo, Author UI demo data, marketing assets
---

# Saebyeok Academy Sample IP

Saebyeok Academy is synthetic demo data for Seizn Author. It is not affiliated with any author, studio, or private dogfood project.

## 1. Identity

| Field | Value |
|---|---|
| Title | Saebyeok Academy |
| Genre | Korean coming-of-age light SF mystery |
| Tone | observational, tense, soft SF, school mystery |
| Duration | D1-D30, 2026-04-02 through 2026-05-01 |
| Characters | 8 |
| World rules | 22 |
| Timeline events | 30 |
| Review cases | 50 |
| Simulation cases | 8 |
| Ending branches | 3 |

## 2. Purpose

- Source data for the seizn.com Author landing live demo.
- Demo content for Author UI Inbox, Review, Characters, Graph, Timeline, Simulate, and World screens.
- Static JSON input for Codex and build-time rendering.
- Marketing-safe sample material for screenshots, clips, and case-study drafts.

## 3. Labeling Rules

Every external display must identify this material as synthetic:

- Short label: `Sample IP`
- Full label: `Sample IP - Synthetic Demo Data`
- English disclosure: `Demo data is a synthetic Sample IP designed for Seizn. Not affiliated with any author or studio.`

Any public screenshot, demo, page, or document that uses these files must keep one of those labels visible or adjacent to the sample.

## 4. Files

| File | Contents | Shape |
|---|---|---|
| `saebyeok_canon_v1.json` | 8-character cast | Character registry shape |
| `saebyeok_world_rules_v1.json` | 22 world rules | World-rule registry shape |
| `saebyeok_timeline_v1.json` | 30 D1-D30 events | Timeline ledger shape |
| `saebyeok_relationships_v1.json` | Relationship matrix | Relationship matrix shape |
| `saebyeok_review_cases_v1.json` | 50 review cases | Author review queue shape |
| `saebyeok_simulation_cases_v1.json` | 8 scene simulations | Landing simulation input |
| `saebyeok-readme.md` | Usage rules and labeling policy | Markdown |

## 5. Separation Guard

This folder is public-facing sample material. Do not place private dogfood names, lore terms, school names, world names, or character names in these files.

Before committing a change to this folder:

1. Run the repository separation guard from the project root.
2. Confirm it reports zero forbidden internal-IP matches.
3. Re-read any new names against the private dogfood name catalog outside this public sample folder.

The README is intentionally inside the default guard scope. Do not add it to the default exclude list.

## 6. Author UI Mapping

| Author UI screen | Saebyeok source | Demo signal |
|---|---|---|
| Inbox | `saebyeok_review_cases_v1.json` | Review card flow |
| Review | `saebyeok_review_cases_v1.json` | Candidate review |
| Characters | `saebyeok_canon_v1.json` | Character cards |
| Graph | `saebyeok_relationships_v1.json` plus canon | Ego-network |
| Timeline | `saebyeok_timeline_v1.json` | Day and character lanes |
| Simulate | `saebyeok_simulation_cases_v1.json` | Candidate generation and leak checks |
| World | `saebyeok_world_rules_v1.json` | Rule tiers and forbidden scope |

## 7. Landing Mapping

| Landing section | Saebyeok source |
|---|---|
| Canon graph | 8 characters, 22 rules, 30 events |
| Review queue | Review and simulation cases |
| Conflict and simulation | Selected conflict cases and scene outputs |
| Scene simulation cards | Simulation case snapshots |
| Conflict cards | Review cases with contradictions |

## 8. Change Checklist

1. Update this README when a file is added or renamed.
2. Keep the synthetic labeling rules unchanged unless legal copy changes.
3. Run the repository separation guard.
4. Verify the landing demo still loads all seven source files.

## 9. Decision History

- 2026-05-02 v1 - Initial seven-file sample IP package.
- 2026-05-03 v2 - README moved into the default separation guard scope and private-IP comparison terms removed.
