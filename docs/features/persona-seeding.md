# Persona Seeding

Persona seeding imports synthetic Korean NPC candidates from Nemotron-Personas-Korea into Seizn graph entities. It is designed for game teams that need a culturally grounded starting set, then want designers to review, accept, and polish the final characters.

## Plan Limits

| Plan | Source | Batch limit | Region pin |
| --- | --- | ---: | --- |
| Free | Bundled 1K sample | 25 | No |
| Indie | Bundled 1K sample | 100 | No |
| Studio | Live dataset path | 500 | No |
| Pro | Live dataset path | 2,000 | Seoul option |
| Enterprise | Live dataset path | Unlimited | Seoul option |

Studio and higher tiers can use the live-source path when a Hugging Face token is configured. Free and Indie always use the bundled deterministic sample.

## Hybrid Mode

Hybrid mode previews a candidate batch and stores only accepted rows. Use it when a designer wants to skim region, occupation, age band, and summary before graph insertion. Rejected rows are counted as skipped and never written to `graph_entities`.

## Attribution

Seeded personas are derived from NVIDIA Nemotron-Personas-Korea and carry provenance metadata with each graph entity. Any UI that displays seeded personas must show visible attribution to Nemotron-Personas-Korea, NVIDIA, and CC BY 4.0.

Keep these fields with exports and downstream sync:

- `source`
- `source_uuid`
- `source_license`
- `source_license_url`
- `source_attribution`
- `source_dataset_url`
- `seeded_at`
- `is_synthetic`

## PIPA Framing

For Korean studios, persona seeding requires the `persona_seeding` consent scope. The consent page includes delegated-processing disclosure language for PIPA review, including controller, purpose, retention, and recipient region. The Seoul preference is compliance-posture metadata only; actual Supabase project region is set during provisioning.

## Code Example

```ts
await seizn.personas.seed({
  count: 50,
  criteria: { region: '서울' },
  mode: 'hybrid',
});
```

## References

- NVIDIA blog: https://blogs.nvidia.co.kr/blog/nemotron-open-source-ai/
- Dataset card: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea

## Limitations

- The bundled source is a deterministic 1K sample; the live source is the full 7M dataset path.
- Auto-translation is not provided.
- Persona personality, name fit, and narrative role still require human polish before a shipped game.
