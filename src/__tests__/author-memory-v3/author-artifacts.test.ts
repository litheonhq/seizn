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
  'knot_author_eval_seed_v2.json',
  'knot_author_eval_seed_v3.json',
];

const knotMarkdownFiles = [
  'canon_authority_rules.md',
  'review_taxonomy.md',
];

const authorUiJsonFiles = [
  'author_ui_data_contracts.json',
  'author_ui_query_bindings.json',
  'author_scene_simulation_output_contract.json',
];

const authorUiMarkdownFiles = [
  'author_ui_information_architecture.md',
  'author_ui_screen_specs.md',
  'author_ui_user_flows.md',
  'author_ui_component_inventory.md',
  'author_ui_empty_error_states.md',
  'author_ui_mutation_invalidation_matrix.md',
];

describe('Author Memory v3 artifact contracts', () => {
  it('keeps all 19 Codex specification artifacts present', () => {
    const artifactPaths = [
      ...knotJsonFiles.map((file) => join('docs', 'knot-input', file)),
      ...knotMarkdownFiles.map((file) => join('docs', 'knot-input', file)),
      ...authorUiJsonFiles.map((file) => join('docs', 'author-ui', file)),
      ...authorUiMarkdownFiles.map((file) => join('docs', 'author-ui', file)),
    ];

    expect(artifactPaths).toHaveLength(19);
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
    const evalSeedV1 = readJson('docs/knot-input/knot_author_eval_seed_v1.json');
    const evalSeedV2 = readJson('docs/knot-input/knot_author_eval_seed_v2.json');
    const evalSeedV3 = readJson('docs/knot-input/knot_author_eval_seed_v3.json');
    const bundle = {
      characterRegistry,
      worldRuleRegistry,
      relationshipMatrix,
      timelineEventLedger,
      evalSeed: evalSeedV3,
    };

    const records = knotInputBundleToAuthorRecords(bundle);
    const casesV1 = knotEvalSeedToAuthorEvalCases(evalSeedV1);
    const casesV2 = knotEvalSeedToAuthorEvalCases(evalSeedV2, {
      source: 'docs/knot-input/knot_author_eval_seed_v2.json',
    });
    const cases = knotEvalSeedToAuthorEvalCases(evalSeedV3, {
      source: 'docs/knot-input/knot_author_eval_seed_v3.json',
    });
    const payload = knotInputBundleToAuthorEvalJobPayload({
      projectId: 'knot',
      runId: 'knot-artifact-regression',
      bundle,
      evalSeedSource: 'docs/knot-input/knot_author_eval_seed_v3.json',
    });

    const characters = readArray(characterRegistry, 'characters');
    const supportingCast = readArray(characterRegistry, 'supporting_cast');
    const supportingPointers = readArray(characterRegistry, 'supporting_cast_pointer');
    const rules = readArray(worldRuleRegistry, 'rules');
    const relationships = readArray(relationshipMatrix, 'relationships');
    const events = readArray(timelineEventLedger, 'events');

    expect(characters.length).toBeGreaterThanOrEqual(7);
    expect(characters.length + supportingCast.length + supportingPointers.length)
      .toBeGreaterThanOrEqual(12);
    expect(rules.length).toBeGreaterThanOrEqual(18);
    expect(relationships.length).toBeGreaterThanOrEqual(21);
    expect(events.length).toBeGreaterThanOrEqual(22);
    expect(casesV1).toHaveLength(12);
    expect(casesV2.length).toBeGreaterThanOrEqual(52);
    expect(cases).toHaveLength(100);
    expect(records.length).toBe(
      characters.length
        + supportingCast.length
        + rules.length
        + relationships.length
        + events.length
    );
    expect(payload.records).toHaveLength(records.length);
    expect(payload.cases).toHaveLength(cases.length);
  });

  it('keeps Author UI query bindings aligned with data contracts', () => {
    const contracts = readJson('docs/author-ui/author_ui_data_contracts.json');
    const bindings = readJson('docs/author-ui/author_ui_query_bindings.json');
    const contractEndpoints = extractContractEndpoints(contracts);
    const screenBindingEndpoints = extractRequiredScreenBindingEndpoints(bindings);
    const screens = asObject(bindings.screens);
    const screenSpecs = Object.values(screens).map(asObject);
    const queryCount = screenSpecs.reduce(
      (count, screen) => count + readArray(screen, 'queries').length,
      0
    );
    const mutationCount = screenSpecs.reduce(
      (count, screen) => count + readArray(screen, 'mutations').length,
      0
    );

    expect(Object.keys(screens).sort()).toEqual([
      'account_byok',
      'character_detail',
      'characters_list',
      'conflicts',
      'dashboard',
      'graph',
      'inbox',
      'review_queue',
      'settings',
      'simulate',
      'sync',
      'timeline',
    ]);
    expect(queryCount).toBe(14);
    expect(mutationCount).toBe(13);
    expect(contractEndpoints).toHaveLength(26);
    expect(screenBindingEndpoints).toHaveLength(26);
    expect(screenBindingEndpoints).toEqual(contractEndpoints);

    const contractScreens = asObject(contracts.screens);
    const inboxContracts = asObject(contractScreens.inbox);
    const importUpload = asObject(inboxContracts['POST /api/projects/{id}/imports']);
    const importUploadFormData = asObject(importUpload.request_form_data);
    const sceneSimulationContracts = asObject(contractScreens.scene_simulation);
    const runSimulation = asObject(sceneSimulationContracts['POST /api/projects/{id}/simulate']);
    const runSimulationResponse = asObject(runSimulation.response);
    const settingsContracts = asObject(contractScreens.settings);
    const saveByok = asObject(settingsContracts['POST /api/account/byok']);
    const saveByokRequest = asObject(saveByok.request);
    const websocketEvents = asObject(asObject(contracts.websocket_events).events);
    const formStateBindings = asObject(bindings.form_state_bindings);
    const byokForm = asObject(formStateBindings.byok_form);

    expect(importUploadFormData.source_role).toBe('canon|character|scene|reference|visual');
    expect(runSimulationResponse).toMatchObject({
      simulation_id: 'string',
      status: 'queued|running',
    });
    expect(saveByokRequest.provider).toBe('anthropic');
    expect(websocketEvents['candidate.status_changed']).toBe(
      '{candidate_id, old_status, new_status, type, target_entity_id?, ack_token?}'
    );
    expect(readArray(byokForm, 'fields')).toEqual(['provider', 'api_key']);
  });
});

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readArray(object: Record<string, unknown>, key: string): unknown[] {
  const value = object[key];
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractContractEndpoints(rootObject: Record<string, unknown>): string[] {
  const endpoints = new Set<string>();
  collectEndpointKeys(asObject(rootObject.screens), endpoints);
  return [...endpoints].sort();
}

function extractRequiredScreenBindingEndpoints(rootObject: Record<string, unknown>): string[] {
  const endpoints = new Set<string>();
  collectBindingEndpoints(asObject(rootObject.screens), endpoints);
  return [...endpoints].sort();
}

function collectEndpointKeys(value: unknown, endpoints: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectEndpointKeys(item, endpoints);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (isEndpoint(key)) {
      endpoints.add(key);
    }
    collectEndpointKeys(child, endpoints);
  }
}

function collectBindingEndpoints(value: unknown, endpoints: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBindingEndpoints(item, endpoints);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'endpoint' && typeof child === 'string') {
      const endpoint = normalizeRequiredEndpoint(child);
      if (endpoint) {
        endpoints.add(endpoint);
      }
      continue;
    }

    collectBindingEndpoints(child, endpoints);
  }
}

function normalizeRequiredEndpoint(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('(')) {
    return null;
  }

  const match = trimmed.match(/^(GET|POST|PATCH|DELETE)\s+\/api\/[^\s,)]+/);
  return match?.[0] ?? null;
}

function isEndpoint(value: string): boolean {
  return /^(GET|POST|PATCH|DELETE)\s+\/api\//.test(value);
}
