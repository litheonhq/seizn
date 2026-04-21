import { describe, expect, it } from 'vitest';
import {
  diffMemoryEditorRows,
  memoryRowsToCsv,
  parseMemoryEditorCsv,
  type MemoryEditorRow,
} from './diff';

const row: MemoryEditorRow = {
  id: 'mem-1',
  content: 'Kael remembers the old gate.',
  memoryType: 'fact',
  tags: ['lore', 'gate'],
  namespace: 'default',
  importance: 5,
  npcId: 'kael',
  agentId: 'kael',
  source: 'api',
  isEncrypted: false,
  createdAt: '2026-04-21T00:00:00.000Z',
  updatedAt: '2026-04-21T00:00:00.000Z',
};

describe('memory editor diff utilities', () => {
  it('round-trips CSV with quoted content and tags', () => {
    const csv = memoryRowsToCsv([{ ...row, content: 'Kael says, "hold the line".' }]);
    const parsed = parseMemoryEditorCsv(csv);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'mem-1',
      content: 'Kael says, "hold the line".',
      npcId: 'kael',
      tags: ['lore', 'gate'],
    });
  });

  it('marks changed rows and blocks encrypted memories', () => {
    const diff = diffMemoryEditorRows(
      [{ ...row, isEncrypted: true }],
      [{ ...row, id: 'mem-1', content: 'Kael remembers a forbidden gate.' }]
    );

    expect(diff.summary.update).toBe(1);
    expect(diff.summary.blocked).toBe(1);
    expect(diff.items[0].fields.map((field) => field.field)).toContain('content');
    expect(diff.items[0].errors).toContain('encrypted memories cannot be edited in memory editor');
  });

  it('blocks updates for ids outside the current editor scope', () => {
    const diff = diffMemoryEditorRows([], [{ ...row, id: 'missing-memory' }]);

    expect(diff.summary.update).toBe(1);
    expect(diff.summary.blocked).toBe(1);
    expect(diff.items[0].errors).toContain('memory id was not found in the current editor scope');
  });
});
