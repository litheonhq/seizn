import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GraphView } from '@/components/dashboard/redesign/views/graph-view';
import type {
  CharacterSummary,
  GraphEdge,
  GraphNode,
} from '@/components/dashboard/redesign/views/types';

vi.mock('@/contexts/DashboardLocaleContext', () => ({
  useDashboardTranslation: () => ({
    locale: 'en',
    dictionary: {},
    isLoading: false,
    t: (key: string) => key,
  }),
}));

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

describe('GraphView selection state', () => {
  it('selects the first node when data arrives after an empty render', async () => {
    await render(<GraphView nodes={[]} edges={[]} characters={[]} />);
    expect(textContains('dashboard.graph.empty')).toBe(true);

    await rerender(
      <GraphView
        nodes={nodes}
        edges={edges}
        characters={characters}
      />
    );

    expect(textContains('dashboard.graph.detail.directTies')).toBe(true);
  });

  it('reselects the first available node when the selected node disappears', async () => {
    await render(
      <GraphView
        nodes={nodes}
        edges={edges}
        characters={characters}
      />
    );

    await rerender(
      <GraphView
        nodes={[replacementNode]}
        edges={[]}
        characters={[replacementCharacter]}
      />
    );

    expect(textContains('Replacement')).toBe(true);
    expect(textContains('dashboard.graph.detail.directTies')).toBe(true);
  });
});

const nodes: GraphNode[] = [
  { id: 'alice', label: 'Alice', role: 'Lead', x: 220, y: 190, r: 32 },
  { id: 'bob', label: 'Bob', role: 'Supporting', x: 360, y: 190, r: 22 },
];

const edges: GraphEdge[] = [
  { a: 'alice', b: 'bob', kind: 'ally', strength: 0.6, conflict: false },
];

const characters: CharacterSummary[] = [
  summary('alice', 'Alice', 'Lead'),
  summary('bob', 'Bob', 'Supporting'),
];

const replacementNode: GraphNode = {
  id: 'replacement',
  label: 'Replacement',
  role: 'Lead',
  x: 290,
  y: 190,
  r: 32,
};

const replacementCharacter = summary('replacement', 'Replacement', 'Lead');

function summary(id: string, name: string, role: CharacterSummary['role']): CharacterSummary {
  return {
    id,
    name,
    role,
    aka: '',
    episodes: 0,
    relations: 0,
    conflicts: 0,
    color: '#c96442',
  };
}

async function render(element: ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await rerender(element);
}

async function rerender(element: ReactElement): Promise<void> {
  await act(async () => {
    root?.render(element);
  });
}

function textContains(needle: string): boolean {
  if (!container) return false;
  return container.textContent?.includes(needle) ?? false;
}
