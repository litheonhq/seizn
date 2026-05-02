import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  knotEvalSeedToAuthorEvalCases,
  knotInputBundleToAuthorEvalJobPayload,
  knotInputBundleToAuthorRecords,
} from '@/lib/author/memory-v3';

const root = process.cwd();

const knotJsonFiles = [
  'source_manifest.json',
  'character_registry.json',
  'world_rule_registry.json',
  'relationship_matrix.json',
  'timeline_event_ledger.json',
  'knot_author_eval_seed_v1.json',
];

const knotMarkdownFiles = [
  'canon_authority_rules.md',
  'review_taxonomy.md',
];

const authorUiJsonFiles = [
  'author_ui_data_contracts.json',
  'author_scene_simulation_output_contract.json',
];

const authorUiMarkdownFiles = [
  'author_ui_information_architecture.md',
  'author_ui_screen_specs.md',
  'author_ui_user_flows.md',
  'author_ui_component_inventory.md',
  'author_ui_empty_error_states.md',
];

describe('Author Memory v3 artifact contracts', () => {
  it('keeps all 15 Codex specification artifacts present', () => {
    const artifactPaths = [
      ...knotJsonFiles.map((file) => join('docs', 'knot-input', file)),
      ...knotMarkdownFiles.map((file) => join('docs', 'knot-input', file)),
      ...authorUiJsonFiles.map((file) => join('docs', 'author-ui', file)),
      ...authorUiMarkdownFiles.map((file) => join('docs', 'author-ui', file)),
    ];

    expect(artifactPaths).toHaveLength(15);
    for (const path of artifactPaths) {
      expect(readFileSync(join(root, path), 'utf8').length).toBeGreaterThan(0);
    }
  });

  it('keeps JSON artifacts machine-parseable', () => {
    const jsonPaths = [
      ...knotJsonFiles.map((file) => join(root, 'docs', 'knot-input', file)),
      ...authorUiJsonFiles.map((file) => join(root, 'docs', 'author-ui', file)),
    ];

    for (const path of jsonPaths) {
      expect(() => JSON.parse(readFileSync(path, 'utf8')), path).not.toThrow();
    }
  });

  it('maps actual KNOT artifacts into Author Memory v3 records and eval payloads', () => {
    const characterRegistry = readJson('docs/knot-input/character_registry.json');
    const worldRuleRegistry = readJson('docs/knot-input/world_rule_registry.json');
    const relationshipMatrix = readJson('docs/knot-input/relationship_matrix.json');
    const timelineEventLedger = readJson('docs/knot-input/timeline_event_ledger.json');
    const evalSeed = readJson('docs/knot-input/knot_author_eval_seed_v1.json');
    const bundle = {
      characterRegistry,
      worldRuleRegistry,
      relationshipMatrix,
      timelineEventLedger,
      evalSeed,
    };

    const records = knotInputBundleToAuthorRecords(bundle);
    const cases = knotEvalSeedToAuthorEvalCases(evalSeed);
    const payload = knotInputBundleToAuthorEvalJobPayload({
      projectId: 'knot',
      runId: 'knot-artifact-regression',
      bundle,
    });

    const characters = readArray(characterRegistry, 'characters');
    const rules = readArray(worldRuleRegistry, 'rules');
    const relationships = readArray(relationshipMatrix, 'relationships');
    const events = readArray(timelineEventLedger, 'events');

    expect(characters).toHaveLength(12);
    expect(rules).toHaveLength(18);
    expect(relationships.length).toBeGreaterThanOrEqual(8);
    expect(events.length).toBeGreaterThanOrEqual(22);
    expect(cases).toHaveLength(12);
    expect(records.length).toBe(
      characters.length
        + rules.length
        + relationships.length
        + events.length
    );
    expect(payload.records).toHaveLength(records.length);
    expect(payload.cases).toHaveLength(cases.length);
  });
});

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readArray(object: Record<string, unknown>, key: string): unknown[] {
  const value = object[key];
  return Array.isArray(value) ? value : [];
}
