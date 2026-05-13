'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthorWorkspaceTab } from '@/lib/dashboard-routes';
import { NAV_GROUPS } from '../sidebar/nav-config';
import type { TopBarTab } from '../top-bar';

export interface UseGlobalShortcutsOptions {
  /** Callback when an author-workspace tab shortcut fires (preferred over router.push for same-page tab switch). */
  onAuthorTab?: (tab: TopBarTab) => void;
  /** Disable the listener (e.g. while a modal is open). */
  enabled?: boolean;
}

interface ShortcutEntry {
  href: string;
  isAuthorTab: boolean;
}

/**
 * Registers a global `keydown` listener that maps the `kbd` values declared in
 * sidebar nav-config to navigation actions. Mirrors what the sidebar tooltip
 * promises so the hint isn't a lie.
 *
 * Guards:
 * - IME composition (`isComposing` / keyCode 229) — Korean/Japanese/Chinese
 *   users composing characters won't trigger nav.
 * - Modifier keys (meta/ctrl/alt) — don't clash with Ctrl+I bold etc.
 * - Focused inputs/textareas/contenteditable — typing into a field never fires.
 */
export function useGlobalShortcuts(options: UseGlobalShortcutsOptions = {}): void {
  const { onAuthorTab, enabled = true } = options;
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    const shortcuts = new Map<string, ShortcutEntry>();
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (!item.kbd) continue;
        shortcuts.set(item.kbd.toLowerCase(), {
          href: item.href,
          isAuthorTab: item.href.startsWith('/dashboard/author?tab='),
        });
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      // IME composition guard — CJK input methods set isComposing or keyCode 229.
      if (event.isComposing || event.keyCode === 229) return;

      // Skip when any modifier is held — leaves Cmd/Ctrl/Alt+X chords free.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Skip when focus is inside text input / contenteditable.
      // (jsdom doesn't reflect isContentEditable so also check the attribute.)
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (target.isContentEditable) return;
        if (target.getAttribute('contenteditable') === 'true') return;
      }

      const shortcut = shortcuts.get(event.key.toLowerCase());
      if (!shortcut) return;

      event.preventDefault();

      if (shortcut.isAuthorTab && onAuthorTab) {
        const tab = new URL(shortcut.href, 'https://www.seizn.com').searchParams.get('tab');
        if (isAuthorWorkspaceTab(tab)) {
          onAuthorTab(tab as TopBarTab);
          return;
        }
      }

      router.push(shortcut.href);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onAuthorTab, router]);
}
