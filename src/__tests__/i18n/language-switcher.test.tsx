import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalizedPath, LanguageSwitcher } from '@/components/language-switcher';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/pricing',
  useRouter: () => ({ push: pushMock }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeReactAct();

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    pushMock.mockReset();
    global.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
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
    vi.restoreAllMocks();
  });

  it('builds localized paths by replacing or adding the locale segment', () => {
    expect(getLocalizedPath('/en/pricing', 'ko')).toBe('/ko/pricing');
    expect(getLocalizedPath('/pricing', 'ja')).toBe('/ja/pricing');
    expect(getLocalizedPath('/', 'fr')).toBe('/fr/');
  });

  it('opens the language menu and navigates to the selected locale', async () => {
    await render(<LanguageSwitcher currentLocale="en" />);

    const trigger = query('[data-testid="language-switcher-trigger"]');
    expect(trigger.textContent?.trim()).toBe('EN');
    expect(trigger.textContent).not.toContain('English');

    await click(trigger);
    expect(query('[data-locale="ko"]').textContent?.trim()).toBe('KO');
    expect(query('[data-locale="ko"]').textContent).not.toContain('Korean');
    expect(query('[data-locale="zh-hans"]').textContent?.trim()).toBe('ZH-S');
    expect(query('[data-locale="zh-hant"]').textContent?.trim()).toBe('ZH-T');

    await click(query('[data-locale="ko"]'));

    expect(pushMock).toHaveBeenCalledWith('/ko/pricing');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(document.cookie).toContain('NEXT_LOCALE=ko');
  });
});

async function render(ui: ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(ui);
  });
}

function query(selector: string): HTMLElement {
  const element = (container ?? document.body).querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function beforeReactAct(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
