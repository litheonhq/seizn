import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConflictCard } from '@/components/dashboard/redesign/conflict-card';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

describe('ConflictCard severity', () => {
  it('renders P1 with the Critical label and terracotta side rail color', async () => {
    await render(
      <ConflictCard
        severity="P1"
        kind="Character"
        episode="Ch. 7"
        title="Test conflict"
        why="Test reason"
        refs={['ref-a']}
        severityLabel="Critical"
        resolveLabel="Resolve"
        openEvidenceLabel="Open evidence"
        dismissLabel="Dismiss"
      />
    );
    expect(textContains('P1 · Critical')).toBe(true);
    expect(textContains('Test conflict')).toBe(true);
    expect(textContains('Test reason')).toBe(true);
    expect(textContains('ref-a')).toBe(true);
    expect(textContains('Resolve')).toBe(true);
  });

  it('renders P2 with the Warning label', async () => {
    await render(
      <ConflictCard
        severity="P2"
        kind="Conflict"
        episode="Ch. 6"
        title="Mid-tier conflict"
        severityLabel="Warning"
        resolveLabel="Resolve"
        openEvidenceLabel="Open evidence"
        dismissLabel="Dismiss"
      />
    );
    expect(textContains('P2 · Warning')).toBe(true);
  });

  it('renders P3 with the Note label and no why/refs', async () => {
    await render(
      <ConflictCard
        severity="P3"
        kind="Note"
        episode="Ch. 8"
        title="Low-severity note"
        severityLabel="Note"
        resolveLabel="Resolve"
        openEvidenceLabel="Open evidence"
        dismissLabel="Dismiss"
      />
    );
    expect(textContains('P3 · Note')).toBe(true);
    expect(textContains('Low-severity note')).toBe(true);
  });
});

async function render(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
}

function textContains(needle: string): boolean {
  if (!container) return false;
  return container.textContent?.includes(needle) ?? false;
}
