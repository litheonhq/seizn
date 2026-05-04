import { describe, expect, it } from 'vitest';

import { validateScopeConfig } from './validation';
import type { ApiKeyScope } from './types';

describe('scoped API key security rules', () => {
  it('rejects user-level scopes that carry an organization binding', () => {
    const result = validateScopeConfig({
      level: 'user',
      organizationId: 'org-attacker-selected',
      actions: ['read'],
    } as ApiKeyScope);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('User-level scope cannot include an organization ID');
  });

  it('rejects user-level scopes that carry project bindings', () => {
    const result = validateScopeConfig({
      level: 'user',
      projectIds: ['project-1'],
      actions: ['read'],
    } as ApiKeyScope);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('User-level scope cannot include project IDs');
  });
});
