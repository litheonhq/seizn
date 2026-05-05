import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  EmptyIllustration,
  EmptyState,
} from '@/components/dashboard/redesign/empty-state';

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

describe('EmptyIllustration kinds', () => {
  it('renders the characters illustration', async () => {
    await render(<EmptyIllustration kind="characters" />);
    const svg = container!.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  it('renders the inbox illustration with a single envelope path', async () => {
    await render(<EmptyIllustration kind="inbox" />);
    const svg = container!.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the graph illustration with three nodes', async () => {
    await render(<EmptyIllustration kind="graph" />);
    const svg = container!.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
  });
});

describe('EmptyState shell', () => {
  it('renders title and body without primary CTA when none provided', async () => {
    await render(
      <EmptyState
        kind="characters"
        title="It is quiet here"
        body="Add your first character"
      />
    );
    expect(textContains('It is quiet here')).toBe(true);
    expect(textContains('Add your first character')).toBe(true);
    expect(container!.querySelector('button')).toBeNull();
  });

  it('renders the primary CTA when provided', async () => {
    await render(
      <EmptyState
        kind="characters"
        title="Empty"
        body="No data"
        primary="Add character"
      />
    );
    const button = container!.querySelector('button');
    expect(button).toBeTruthy();
    expect(button!.textContent?.includes('Add character')).toBe(true);
  });

  it('renders kbd hints when provided', async () => {
    await render(
      <EmptyState
        kind="graph"
        title="Empty"
        body="Body"
        primary="Action"
        hints={[
          { k: '⌘ N', t: 'New' },
          { k: '?', t: 'Help' },
        ]}
      />
    );
    expect(textContains('New')).toBe(true);
    expect(textContains('Help')).toBe(true);
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
