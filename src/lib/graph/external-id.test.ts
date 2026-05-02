import { describe, expect, it } from 'vitest';
import {
  getEntityExternalId,
  isMissingExternalIdColumnError,
  withExternalIdProperty,
} from './external-id';

describe('graph external id helpers', () => {
  it('prefers the external_id column and falls back to properties.external_id', () => {
    expect(getEntityExternalId({ external_id: 'column-id' })).toBe('column-id');
    expect(getEntityExternalId({ properties: { external_id: 'property-id' } })).toBe(
      'property-id'
    );
    expect(getEntityExternalId({ properties: { external_id: '' } })).toBeNull();
  });

  it('adds external_id to copied properties only when provided', () => {
    const original = { scope: 'canon' };

    expect(withExternalIdProperty(original, 'sori')).toEqual({
      scope: 'canon',
      external_id: 'sori',
    });
    expect(withExternalIdProperty(original)).toEqual(original);
  });

  it('recognizes only missing external_id column errors', () => {
    expect(isMissingExternalIdColumnError({ code: '42703' })).toBe(true);
    expect(
      isMissingExternalIdColumnError({
        code: 'PGRST204',
        message: "Could not find the 'external_id' column of 'graph_entities' in the schema cache",
      })
    ).toBe(true);
    expect(
      isMissingExternalIdColumnError({
        code: '23505',
        message: 'duplicate key value violates unique constraint idx_graph_entities_external_id',
      })
    ).toBe(false);
  });
});
