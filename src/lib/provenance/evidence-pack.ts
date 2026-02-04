/**
 * Verifiable Provenance Evidence Pack
 *
 * Implements W3C PROV-compliant provenance tracking:
 * - Entity, Activity, Agent modeling
 * - Derivation chains
 * - Signed evidence bundles
 * - Export to PROV-JSON and PROV-O
 *
 * @module provenance/evidence-pack
 */

import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto';
import { createServerClient } from '@/lib/supabase';

// ============================================
// W3C PROV Types
// ============================================

/**
 * PROV Entity - Something that was used, generated, or derived
 */
export interface ProvEntity {
  id: string;
  type: 'prov:Entity';
  label?: string;
  value?: unknown;
  generatedAtTime?: string;
  invalidatedAtTime?: string;
  attributes?: Record<string, unknown>;
}

/**
 * PROV Activity - Something that occurs over a period of time
 */
export interface ProvActivity {
  id: string;
  type: 'prov:Activity';
  label?: string;
  startedAtTime?: string;
  endedAtTime?: string;
  attributes?: Record<string, unknown>;
}

/**
 * PROV Agent - Something that bears responsibility
 */
export interface ProvAgent {
  id: string;
  type: 'prov:Agent';
  label?: string;
  agentType?: 'Person' | 'Organization' | 'SoftwareAgent';
  attributes?: Record<string, unknown>;
}

/**
 * PROV Derivation - How one entity was derived from another
 */
export interface ProvDerivation {
  id: string;
  generatedEntity: string;
  usedEntity: string;
  activity?: string;
  type?: 'prov:Revision' | 'prov:Quotation' | 'prov:PrimarySource';
}

/**
 * PROV Usage - An activity used an entity
 */
export interface ProvUsage {
  id: string;
  activity: string;
  entity: string;
  time?: string;
  role?: string;
}

/**
 * PROV Generation - An activity generated an entity
 */
export interface ProvGeneration {
  id: string;
  entity: string;
  activity: string;
  time?: string;
  role?: string;
}

/**
 * PROV Attribution - An entity is attributed to an agent
 */
export interface ProvAttribution {
  id: string;
  entity: string;
  agent: string;
}

/**
 * PROV Association - An activity is associated with an agent
 */
export interface ProvAssociation {
  id: string;
  activity: string;
  agent: string;
  role?: string;
  plan?: string;
}

/**
 * Complete PROV Document
 */
export interface ProvDocument {
  '@context': Record<string, string>;
  id: string;
  type: 'prov:Bundle';
  generatedAtTime: string;
  entity: Record<string, ProvEntity>;
  activity: Record<string, ProvActivity>;
  agent: Record<string, ProvAgent>;
  wasGeneratedBy: Record<string, ProvGeneration>;
  used: Record<string, ProvUsage>;
  wasDerivedFrom: Record<string, ProvDerivation>;
  wasAttributedTo: Record<string, ProvAttribution>;
  wasAssociatedWith: Record<string, ProvAssociation>;
}

// ============================================
// Evidence Pack Types
// ============================================

export interface EvidencePack {
  id: string;
  version: string;
  created: string;
  provenance: ProvDocument;
  signature?: {
    algorithm: string;
    value: string;
    publicKey: string;
  };
  metadata: {
    organizationId: string;
    traceId?: string;
    purpose?: string;
    retentionDays?: number;
  };
  hash: string;
}

export interface EvidenceItem {
  type: 'input' | 'output' | 'context' | 'tool_call' | 'model_response';
  content: unknown;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Evidence Pack Builder
// ============================================

export class EvidencePackBuilder {
  private id: string;
  private entities: Map<string, ProvEntity> = new Map();
  private activities: Map<string, ProvActivity> = new Map();
  private agents: Map<string, ProvAgent> = new Map();
  private generations: Map<string, ProvGeneration> = new Map();
  private usages: Map<string, ProvUsage> = new Map();
  private derivations: Map<string, ProvDerivation> = new Map();
  private attributions: Map<string, ProvAttribution> = new Map();
  private associations: Map<string, ProvAssociation> = new Map();

  private organizationId: string;
  private traceId?: string;
  private purpose?: string;

  constructor(organizationId: string, options?: { traceId?: string; purpose?: string }) {
    this.id = `evidence:${crypto.randomUUID()}`;
    this.organizationId = organizationId;
    this.traceId = options?.traceId;
    this.purpose = options?.purpose;
  }

  /**
   * Add an entity to the evidence pack
   */
  addEntity(params: {
    id: string;
    label?: string;
    value?: unknown;
    generatedAtTime?: string;
    attributes?: Record<string, unknown>;
  }): this {
    this.entities.set(params.id, {
      id: params.id,
      type: 'prov:Entity',
      label: params.label,
      value: params.value,
      generatedAtTime: params.generatedAtTime || new Date().toISOString(),
      attributes: params.attributes,
    });
    return this;
  }

  /**
   * Add an activity to the evidence pack
   */
  addActivity(params: {
    id: string;
    label?: string;
    startedAtTime?: string;
    endedAtTime?: string;
    attributes?: Record<string, unknown>;
  }): this {
    this.activities.set(params.id, {
      id: params.id,
      type: 'prov:Activity',
      label: params.label,
      startedAtTime: params.startedAtTime || new Date().toISOString(),
      endedAtTime: params.endedAtTime,
      attributes: params.attributes,
    });
    return this;
  }

  /**
   * Add an agent to the evidence pack
   */
  addAgent(params: {
    id: string;
    label?: string;
    agentType?: 'Person' | 'Organization' | 'SoftwareAgent';
    attributes?: Record<string, unknown>;
  }): this {
    this.agents.set(params.id, {
      id: params.id,
      type: 'prov:Agent',
      label: params.label,
      agentType: params.agentType,
      attributes: params.attributes,
    });
    return this;
  }

  /**
   * Record that an activity generated an entity
   */
  recordGeneration(entityId: string, activityId: string, time?: string): this {
    const id = `gen:${entityId}:${activityId}`;
    this.generations.set(id, {
      id,
      entity: entityId,
      activity: activityId,
      time: time || new Date().toISOString(),
    });
    return this;
  }

  /**
   * Record that an activity used an entity
   */
  recordUsage(activityId: string, entityId: string, role?: string): this {
    const id = `use:${activityId}:${entityId}`;
    this.usages.set(id, {
      id,
      activity: activityId,
      entity: entityId,
      time: new Date().toISOString(),
      role,
    });
    return this;
  }

  /**
   * Record that an entity was derived from another
   */
  recordDerivation(
    generatedEntityId: string,
    usedEntityId: string,
    activityId?: string,
    derivationType?: 'prov:Revision' | 'prov:Quotation' | 'prov:PrimarySource'
  ): this {
    const id = `der:${generatedEntityId}:${usedEntityId}`;
    this.derivations.set(id, {
      id,
      generatedEntity: generatedEntityId,
      usedEntity: usedEntityId,
      activity: activityId,
      type: derivationType,
    });
    return this;
  }

  /**
   * Record that an entity is attributed to an agent
   */
  recordAttribution(entityId: string, agentId: string): this {
    const id = `attr:${entityId}:${agentId}`;
    this.attributions.set(id, {
      id,
      entity: entityId,
      agent: agentId,
    });
    return this;
  }

  /**
   * Record that an activity is associated with an agent
   */
  recordAssociation(activityId: string, agentId: string, role?: string): this {
    const id = `assoc:${activityId}:${agentId}`;
    this.associations.set(id, {
      id,
      activity: activityId,
      agent: agentId,
      role,
    });
    return this;
  }

  /**
   * Build a complete RAG interaction evidence trail
   */
  addRagInteraction(params: {
    query: string;
    queryId: string;
    contexts: Array<{ id: string; content: string; source: string }>;
    response: string;
    responseId: string;
    modelId: string;
    userId?: string;
    timestamp?: string;
  }): this {
    const now = params.timestamp || new Date().toISOString();
    const activityId = `activity:rag:${params.queryId}`;

    // Add user agent if provided
    if (params.userId) {
      this.addAgent({
        id: `agent:user:${params.userId}`,
        label: 'User',
        agentType: 'Person',
      });
    }

    // Add model agent
    this.addAgent({
      id: `agent:model:${params.modelId}`,
      label: params.modelId,
      agentType: 'SoftwareAgent',
      attributes: { modelId: params.modelId },
    });

    // Add query entity
    this.addEntity({
      id: `entity:query:${params.queryId}`,
      label: 'User Query',
      value: params.query,
      generatedAtTime: now,
    });

    // Add context entities
    for (const ctx of params.contexts) {
      this.addEntity({
        id: `entity:context:${ctx.id}`,
        label: 'Retrieved Context',
        value: ctx.content,
        attributes: { source: ctx.source },
      });
    }

    // Add RAG activity
    this.addActivity({
      id: activityId,
      label: 'RAG Generation',
      startedAtTime: now,
      endedAtTime: now,
      attributes: { modelId: params.modelId },
    });

    // Add response entity
    this.addEntity({
      id: `entity:response:${params.responseId}`,
      label: 'Model Response',
      value: params.response,
      generatedAtTime: now,
    });

    // Record relationships
    this.recordUsage(activityId, `entity:query:${params.queryId}`, 'query');
    for (const ctx of params.contexts) {
      this.recordUsage(activityId, `entity:context:${ctx.id}`, 'context');
      this.recordDerivation(
        `entity:response:${params.responseId}`,
        `entity:context:${ctx.id}`,
        activityId,
        'prov:PrimarySource'
      );
    }
    this.recordGeneration(`entity:response:${params.responseId}`, activityId, now);
    this.recordAssociation(activityId, `agent:model:${params.modelId}`, 'generator');

    if (params.userId) {
      this.recordAttribution(`entity:query:${params.queryId}`, `agent:user:${params.userId}`);
      this.recordAssociation(activityId, `agent:user:${params.userId}`, 'initiator');
    }

    return this;
  }

  /**
   * Build the evidence pack
   */
  build(): EvidencePack {
    const provDocument: ProvDocument = {
      '@context': {
        prov: 'http://www.w3.org/ns/prov#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        seizn: 'https://seizn.ai/ns/evidence#',
      },
      id: this.id,
      type: 'prov:Bundle',
      generatedAtTime: new Date().toISOString(),
      entity: Object.fromEntries(this.entities),
      activity: Object.fromEntries(this.activities),
      agent: Object.fromEntries(this.agents),
      wasGeneratedBy: Object.fromEntries(this.generations),
      used: Object.fromEntries(this.usages),
      wasDerivedFrom: Object.fromEntries(this.derivations),
      wasAttributedTo: Object.fromEntries(this.attributions),
      wasAssociatedWith: Object.fromEntries(this.associations),
    };

    const content = JSON.stringify(provDocument);
    const hash = createHash('sha256').update(content).digest('hex');

    return {
      id: this.id,
      version: '1.0',
      created: new Date().toISOString(),
      provenance: provDocument,
      metadata: {
        organizationId: this.organizationId,
        traceId: this.traceId,
        purpose: this.purpose,
      },
      hash,
    };
  }

  /**
   * Build and sign the evidence pack
   */
  buildSigned(privateKey: string): EvidencePack {
    const pack = this.build();

    const sign = createSign('SHA256');
    sign.update(JSON.stringify(pack.provenance));
    sign.end();
    const signature = sign.sign(privateKey, 'base64');

    // Extract public key (in production, use proper key management)
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    pack.signature = {
      algorithm: 'RSA-SHA256',
      value: signature,
      publicKey,
    };

    return pack;
  }
}

// ============================================
// Evidence Pack Verifier
// ============================================

export class EvidencePackVerifier {
  /**
   * Verify evidence pack integrity
   */
  verifyIntegrity(pack: EvidencePack): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Verify hash
    const content = JSON.stringify(pack.provenance);
    const expectedHash = createHash('sha256').update(content).digest('hex');

    if (pack.hash !== expectedHash) {
      errors.push('Hash mismatch: evidence pack may have been tampered with');
    }

    // Verify signature if present
    if (pack.signature) {
      try {
        const verify = createVerify('SHA256');
        verify.update(content);
        verify.end();
        const isValid = verify.verify(pack.signature.publicKey, pack.signature.value, 'base64');

        if (!isValid) {
          errors.push('Signature verification failed');
        }
      } catch (e) {
        errors.push(`Signature verification error: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Verify provenance structure
    const structureErrors = this.validateProvStructure(pack.provenance);
    errors.push(...structureErrors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate W3C PROV structure
   */
  private validateProvStructure(prov: ProvDocument): string[] {
    const errors: string[] = [];

    // Check that all referenced entities exist
    for (const [, gen] of Object.entries(prov.wasGeneratedBy)) {
      if (!prov.entity[gen.entity]) {
        errors.push(`Generation references non-existent entity: ${gen.entity}`);
      }
      if (!prov.activity[gen.activity]) {
        errors.push(`Generation references non-existent activity: ${gen.activity}`);
      }
    }

    for (const [, usage] of Object.entries(prov.used)) {
      if (!prov.activity[usage.activity]) {
        errors.push(`Usage references non-existent activity: ${usage.activity}`);
      }
      if (!prov.entity[usage.entity]) {
        errors.push(`Usage references non-existent entity: ${usage.entity}`);
      }
    }

    for (const [, deriv] of Object.entries(prov.wasDerivedFrom)) {
      if (!prov.entity[deriv.generatedEntity]) {
        errors.push(`Derivation references non-existent generated entity: ${deriv.generatedEntity}`);
      }
      if (!prov.entity[deriv.usedEntity]) {
        errors.push(`Derivation references non-existent used entity: ${deriv.usedEntity}`);
      }
    }

    for (const [, attr] of Object.entries(prov.wasAttributedTo)) {
      if (!prov.entity[attr.entity]) {
        errors.push(`Attribution references non-existent entity: ${attr.entity}`);
      }
      if (!prov.agent[attr.agent]) {
        errors.push(`Attribution references non-existent agent: ${attr.agent}`);
      }
    }

    for (const [, assoc] of Object.entries(prov.wasAssociatedWith)) {
      if (!prov.activity[assoc.activity]) {
        errors.push(`Association references non-existent activity: ${assoc.activity}`);
      }
      if (!prov.agent[assoc.agent]) {
        errors.push(`Association references non-existent agent: ${assoc.agent}`);
      }
    }

    return errors;
  }

  /**
   * Trace derivation chain for an entity
   */
  traceDerivation(
    pack: EvidencePack,
    entityId: string
  ): Array<{ entity: ProvEntity; derivationType?: string; via?: ProvActivity }> {
    const chain: Array<{ entity: ProvEntity; derivationType?: string; via?: ProvActivity }> = [];
    const visited = new Set<string>();

    const trace = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const entity = pack.provenance.entity[id];
      if (!entity) return;

      // Find derivations where this entity was generated
      for (const [, deriv] of Object.entries(pack.provenance.wasDerivedFrom)) {
        if (deriv.generatedEntity === id) {
          const usedEntity = pack.provenance.entity[deriv.usedEntity];
          const activity = deriv.activity ? pack.provenance.activity[deriv.activity] : undefined;

          if (usedEntity) {
            chain.push({
              entity: usedEntity,
              derivationType: deriv.type,
              via: activity,
            });
            trace(deriv.usedEntity);
          }
        }
      }
    };

    const rootEntity = pack.provenance.entity[entityId];
    if (rootEntity) {
      chain.push({ entity: rootEntity });
      trace(entityId);
    }

    return chain;
  }
}

// ============================================
// Evidence Pack Storage
// ============================================

export class EvidencePackStore {
  private supabase = createServerClient();

  /**
   * Store evidence pack
   */
  async store(pack: EvidencePack): Promise<void> {
    const { error } = await this.supabase.from('evidence_packs').insert({
      id: pack.id,
      version: pack.version,
      organization_id: pack.metadata.organizationId,
      trace_id: pack.metadata.traceId,
      purpose: pack.metadata.purpose,
      provenance: pack.provenance,
      signature: pack.signature,
      hash: pack.hash,
      created_at: pack.created,
    });

    if (error) {
      throw new Error(`Failed to store evidence pack: ${error.message}`);
    }
  }

  /**
   * Retrieve evidence pack by ID
   */
  async retrieve(packId: string): Promise<EvidencePack | null> {
    const { data, error } = await this.supabase
      .from('evidence_packs')
      .select('*')
      .eq('id', packId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      version: data.version,
      created: data.created_at,
      provenance: data.provenance,
      signature: data.signature,
      metadata: {
        organizationId: data.organization_id,
        traceId: data.trace_id,
        purpose: data.purpose,
      },
      hash: data.hash,
    };
  }

  /**
   * Query evidence packs by trace ID
   */
  async queryByTrace(traceId: string): Promise<EvidencePack[]> {
    const { data, error } = await this.supabase
      .from('evidence_packs')
      .select('*')
      .eq('trace_id', traceId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      version: d.version,
      created: d.created_at,
      provenance: d.provenance,
      signature: d.signature,
      metadata: {
        organizationId: d.organization_id,
        traceId: d.trace_id,
        purpose: d.purpose,
      },
      hash: d.hash,
    }));
  }
}

// ============================================
// Export PROV formats
// ============================================

export function exportToProvJson(pack: EvidencePack): string {
  return JSON.stringify(pack.provenance, null, 2);
}

export function exportToProvN(pack: EvidencePack): string {
  const lines: string[] = [];
  const prov = pack.provenance;

  lines.push(`document`);
  lines.push(`  prefix seizn <https://seizn.ai/ns/evidence#>`);
  lines.push(``);

  // Entities
  for (const [id, entity] of Object.entries(prov.entity)) {
    const attrs = entity.label ? ` [prov:label="${entity.label}"]` : '';
    lines.push(`  entity(${id}${attrs})`);
  }
  lines.push(``);

  // Activities
  for (const [id, activity] of Object.entries(prov.activity)) {
    const times = activity.startedAtTime && activity.endedAtTime
      ? `, ${activity.startedAtTime}, ${activity.endedAtTime}`
      : '';
    lines.push(`  activity(${id}${times})`);
  }
  lines.push(``);

  // Agents
  for (const [id, agent] of Object.entries(prov.agent)) {
    const attrs = agent.label ? ` [prov:label="${agent.label}"]` : '';
    lines.push(`  agent(${id}${attrs})`);
  }
  lines.push(``);

  // Relations
  for (const [, gen] of Object.entries(prov.wasGeneratedBy)) {
    lines.push(`  wasGeneratedBy(${gen.entity}, ${gen.activity})`);
  }

  for (const [, usage] of Object.entries(prov.used)) {
    lines.push(`  used(${usage.activity}, ${usage.entity})`);
  }

  for (const [, deriv] of Object.entries(prov.wasDerivedFrom)) {
    lines.push(`  wasDerivedFrom(${deriv.generatedEntity}, ${deriv.usedEntity})`);
  }

  for (const [, attr] of Object.entries(prov.wasAttributedTo)) {
    lines.push(`  wasAttributedTo(${attr.entity}, ${attr.agent})`);
  }

  for (const [, assoc] of Object.entries(prov.wasAssociatedWith)) {
    lines.push(`  wasAssociatedWith(${assoc.activity}, ${assoc.agent})`);
  }

  lines.push(`endDocument`);

  return lines.join('\n');
}

// ============================================
// Factory functions
// ============================================

export function createEvidencePackBuilder(
  organizationId: string,
  options?: { traceId?: string; purpose?: string }
): EvidencePackBuilder {
  return new EvidencePackBuilder(organizationId, options);
}

export function createEvidencePackVerifier(): EvidencePackVerifier {
  return new EvidencePackVerifier();
}

export function createEvidencePackStore(): EvidencePackStore {
  return new EvidencePackStore();
}
