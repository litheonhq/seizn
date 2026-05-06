import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SidebarItem } from '@/components/dashboard/redesign/sidebar/sidebar-item';
import type { IconProps } from '@/components/dashboard/redesign/icons';
import type { NavItem } from '@/components/dashboard/redesign/sidebar/nav-config';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

describe('SidebarItem author tab clicks', () => {
  it('uses client-state navigation for a normal author tab click', async () => {
    const onSelect = vi.fn();
    await render(<Item onSelect={onSelect} />);

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    const wasNotCanceled = anchor().dispatchEvent(event);

    expect(wasNotCanceled).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('graph');
  });

  it('preserves native navigation for modified author tab clicks', async () => {
    const onSelect = vi.fn();
    await render(<Item onSelect={onSelect} />);
    let defaultPreventedAfterReact: boolean | undefined;
    const stopJsdomNavigation = (event: Event) => {
      defaultPreventedAfterReact = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener('click', stopJsdomNavigation);

    try {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true,
      });
      anchor().dispatchEvent(event);
    } finally {
      window.removeEventListener('click', stopJsdomNavigation);
    }

    expect(defaultPreventedAfterReact).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

function Item({ onSelect }: { onSelect: (tab: 'graph') => void }) {
  return (
    <SidebarItem
      item={item}
      label="Graph"
      active={false}
      collapsed={false}
      onSelect={onSelect}
    />
  );
}

const item: NavItem = {
  id: 'graph',
  labelKey: 'dashboard.nav.graph',
  href: '/dashboard/author?tab=graph',
  icon: TestIcon,
};

function TestIcon(_props: IconProps) {
  return <span data-testid="test-icon" />;
}

async function render(element: ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
}

function anchor(): HTMLAnchorElement {
  const element = container?.querySelector('a');
  if (!(element instanceof HTMLAnchorElement)) {
    throw new Error('SidebarItem did not render an anchor');
  }
  return element;
}
