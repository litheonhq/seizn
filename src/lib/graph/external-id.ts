type JsonObject = Record<string, unknown>;

interface EntityLike {
  external_id?: unknown;
  properties?: unknown;
}

export function getEntityExternalId(entity: EntityLike): string | null {
  if (typeof entity.external_id === 'string' && entity.external_id.length > 0) {
    return entity.external_id;
  }

  if (
    entity.properties &&
    typeof entity.properties === 'object' &&
    !Array.isArray(entity.properties)
  ) {
    const properties = entity.properties as JsonObject;

    if (typeof properties.external_id === 'string' && properties.external_id.length > 0) {
      return properties.external_id;
    }
  }

  return null;
}

export function withExternalIdProperty(
  properties: JsonObject | null | undefined,
  externalId?: string
): JsonObject {
  const next = {
    ...(properties ?? {}),
  };

  if (externalId) {
    next.external_id = externalId;
  }

  return next;
}

export function isMissingExternalIdColumnError(
  error: { code?: string; message?: string } | null | undefined
) {
  if (!error) {
    return false;
  }

  return error.code === '42703' || /external_id/i.test(error.message ?? '');
}
