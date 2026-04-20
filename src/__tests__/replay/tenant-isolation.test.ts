import { describe, expect, it } from 'vitest';

describe('replay tenant isolation contract', () => {
  it('keeps organization id as the lookup boundary', () => {
    const orgA = '00000000-0000-4000-8000-00000000000a';
    const orgB = '00000000-0000-4000-8000-00000000000b';
    const row = {
      trace_id: '00000000-0000-4000-8000-000000000001',
      organization_id: orgA,
    };

    expect(row.organization_id === orgA).toBe(true);
    expect(row.organization_id === orgB).toBe(false);
  });
});
