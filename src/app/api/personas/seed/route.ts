import { NextRequest, NextResponse } from 'next/server';
import { getAuditContext, logAuditEvent } from '@/lib/audit';
import {
  loadPersonaPreviewRows,
  normalizeSeedMode,
  personasToGraphEntityRows,
  resolvePersonaDataSource,
  toPersonaPreview,
  type PersonaSeedCriteria,
  type PersonaSeedSelection,
} from '@/lib/personas/api';
import {
  parsePersonaCount,
  resolvePersonaRouteAuth,
  validatePersonaBatchLimit,
} from '@/lib/personas/route-auth';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

type SeedRequestBody = {
  count?: unknown;
  criteria?: PersonaSeedCriteria;
  mode?: unknown;
  selections?: PersonaSeedSelection[];
};

function normalizeSelections(value: unknown): PersonaSeedSelection[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is PersonaSeedSelection => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return typeof record.personaId === 'string' && typeof record.accept === 'boolean';
    })
    .map((item) => ({ personaId: item.personaId, accept: item.accept }));
}

async function insertGraphEntities(rows: ReturnType<typeof personasToGraphEntityRows>): Promise<string[]> {
  if (rows.length === 0) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('graph_entities')
    .insert(rows)
    .select('id');

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data.map((row) => String((row as { id: unknown }).id)).filter(Boolean)
    : [];
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolvePersonaRouteAuth(request);
    if ('response' in resolved) return resolved.response;

    const body = (await request.json()) as SeedRequestBody;
    const count = parsePersonaCount(body.count);
    const mode = normalizeSeedMode(body.mode);
    if (!mode) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_mode', message: 'mode must be auto, manual, or hybrid.' } },
        { status: 400 },
      );
    }

    const limitError = validatePersonaBatchLimit(count, resolved.auth);
    if (limitError) return limitError;

    const personas = await loadPersonaPreviewRows({
      plan: resolved.auth.plan,
      count,
      criteria: body.criteria,
    });

    const previews = personas.map(toPersonaPreview);
    let selectedPersonas = personas;

    if (mode === 'manual') {
      selectedPersonas = [];
    }

    if (mode === 'hybrid') {
      const selections = normalizeSelections(body.selections);
      if (!selections) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'selections_required', message: 'Hybrid mode requires selections.' },
          },
          { status: 400 },
        );
      }
      const accepted = new Set(
        selections.filter((selection) => selection.accept).map((selection) => selection.personaId),
      );
      selectedPersonas = personas.filter((persona) => accepted.has(persona.uuid));
    }

    const rows = personasToGraphEntityRows(selectedPersonas, {
      userId: resolved.auth.userId,
      organizationId: resolved.auth.organizationId,
    });
    const inserted = await insertGraphEntities(rows);
    const skipped = Math.max(0, personas.length - selectedPersonas.length);
    const source = resolvePersonaDataSource(resolved.auth.plan);

    await logAuditEvent(
      {
        userId: resolved.auth.userId,
        organizationId: resolved.auth.organizationId,
        action: 'persona.seed',
        resourceType: 'graph_entity',
        details: {
          source,
          count: inserted.length,
          requested_count: count,
          mode,
          skipped,
        },
      },
      getAuditContext(request),
    );

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      previews,
      count: inserted.length,
      source,
    });
  } catch (error) {
    logServerError('Persona seed failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'seed_failed', message: 'Failed to seed personas.' } },
      { status: 500 },
    );
  }
}
