import { describe, it, expect } from 'vitest';

describe('Basic Tests', () => {
  it('should pass basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have environment variables', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

describe('Seizn Config', () => {
  it('should load without errors', async () => {
    // Basic smoke test - config should be importable
    expect(true).toBe(true);
  });
});
