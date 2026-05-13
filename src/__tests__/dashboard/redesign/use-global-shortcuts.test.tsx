import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGlobalShortcuts } from '@/components/dashboard/redesign/hooks/use-global-shortcuts';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function fireKeyDown(init: KeyboardEventInit & { target?: EventTarget }): void {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.target) {
    Object.defineProperty(event, 'target', { value: init.target });
  }
  document.dispatchEvent(event);
}

function Harness({ onAuthorTab, enabled }: { onAuthorTab?: (tab: string) => void; enabled?: boolean }) {
  useGlobalShortcuts({ onAuthorTab: onAuthorTab as never, enabled });
  return null;
}

let host: HTMLDivElement;
let root: Root;

function mount(props: { onAuthorTab?: (tab: string) => void; enabled?: boolean } = {}): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<Harness {...props} />);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(host);
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    unmount();
  });

  it('fires onAuthorTab for an author-tab kbd ("i" -> inbox)', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i' });
    expect(onAuthorTab).toHaveBeenCalledWith('inbox');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to router.push when onAuthorTab is not provided', () => {
    mount();
    fireKeyDown({ key: 'i' });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0]).toMatch(/\/dashboard\/author\?tab=inbox/);
  });

  it('skips when IME composition is active (isComposing=true)', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i', isComposing: true });
    expect(onAuthorTab).not.toHaveBeenCalled();
  });

  it('skips when IME composition is signaled via keyCode 229', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i', keyCode: 229 });
    expect(onAuthorTab).not.toHaveBeenCalled();
  });

  it('skips when a modifier key is held (Ctrl+I should not navigate)', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i', ctrlKey: true });
    fireKeyDown({ key: 'i', metaKey: true });
    fireKeyDown({ key: 'i', altKey: true });
    expect(onAuthorTab).not.toHaveBeenCalled();
  });

  it('skips when focus is inside a textarea', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i', target: textarea });
    expect(onAuthorTab).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('skips when focus is inside a contenteditable element', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'i', target: editable });
    expect(onAuthorTab).not.toHaveBeenCalled();
    document.body.removeChild(editable);
  });

  it('does not fire for keys that have no kbd mapping', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab });
    fireKeyDown({ key: 'q' });
    fireKeyDown({ key: '1' });
    fireKeyDown({ key: 'Enter' });
    expect(onAuthorTab).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('respects enabled=false (no listener registered)', () => {
    const onAuthorTab = vi.fn();
    mount({ onAuthorTab, enabled: false });
    fireKeyDown({ key: 'i' });
    expect(onAuthorTab).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
