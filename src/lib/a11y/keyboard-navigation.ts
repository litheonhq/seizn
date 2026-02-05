/**
 * Keyboard Navigation
 *
 * Utilities for keyboard navigation patterns.
 *
 * @module lib/a11y/keyboard-navigation
 */

// =============================================================================
// Key Constants
// =============================================================================

export const Keys = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

// =============================================================================
// Navigation Patterns
// =============================================================================

/**
 * Create roving tabindex navigation for a list
 *
 * @example
 * ```ts
 * const { handleKeyDown, setActiveIndex, activeIndex } = createRovingTabindex(items.length);
 *
 * items.map((item, index) => (
 *   <button
 *     key={item.id}
 *     tabIndex={index === activeIndex ? 0 : -1}
 *     onKeyDown={handleKeyDown}
 *     onFocus={() => setActiveIndex(index)}
 *   >
 *     {item.label}
 *   </button>
 * ));
 * ```
 */
export function createRovingTabindex(
  itemCount: number,
  options: {
    initialIndex?: number;
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
  } = {}
) {
  const { initialIndex = 0, orientation = 'vertical', loop = true, onSelect } = options;

  let activeIndex = initialIndex;
  const listeners = new Set<(index: number) => void>();

  const setActiveIndex = (index: number) => {
    activeIndex = index;
    for (const listener of listeners) {
      listener(index);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    let newIndex = activeIndex;
    const isVertical = orientation === 'vertical' || orientation === 'both';
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';

    switch (event.key) {
      case Keys.ARROW_DOWN:
        if (isVertical) {
          event.preventDefault();
          newIndex = loop
            ? (activeIndex + 1) % itemCount
            : Math.min(activeIndex + 1, itemCount - 1);
        }
        break;

      case Keys.ARROW_UP:
        if (isVertical) {
          event.preventDefault();
          newIndex = loop
            ? (activeIndex - 1 + itemCount) % itemCount
            : Math.max(activeIndex - 1, 0);
        }
        break;

      case Keys.ARROW_RIGHT:
        if (isHorizontal) {
          event.preventDefault();
          newIndex = loop
            ? (activeIndex + 1) % itemCount
            : Math.min(activeIndex + 1, itemCount - 1);
        }
        break;

      case Keys.ARROW_LEFT:
        if (isHorizontal) {
          event.preventDefault();
          newIndex = loop
            ? (activeIndex - 1 + itemCount) % itemCount
            : Math.max(activeIndex - 1, 0);
        }
        break;

      case Keys.HOME:
        event.preventDefault();
        newIndex = 0;
        break;

      case Keys.END:
        event.preventDefault();
        newIndex = itemCount - 1;
        break;

      case Keys.ENTER:
      case Keys.SPACE:
        event.preventDefault();
        onSelect?.(activeIndex);
        return;

      default:
        return;
    }

    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
      // Focus the new element (caller should handle this)
    }
  };

  return {
    handleKeyDown,
    setActiveIndex,
    getActiveIndex: () => activeIndex,
    subscribe: (callback: (index: number) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}

/**
 * Create typeahead search for a list
 */
export function createTypeahead(
  items: string[],
  options: { debounceMs?: number } = {}
) {
  const { debounceMs = 500 } = options;

  let searchString = '';
  let clearTimeout: ReturnType<typeof setTimeout> | null = null;

  return {
    handleKeyPress: (event: KeyboardEvent): number | null => {
      // Only handle printable characters
      if (event.key.length !== 1) return null;

      // Clear previous timeout
      if (clearTimeout) {
        globalThis.clearTimeout(clearTimeout);
      }

      // Add to search string
      searchString += event.key.toLowerCase();

      // Set timeout to clear search
      clearTimeout = setTimeout(() => {
        searchString = '';
      }, debounceMs);

      // Find matching item
      const matchIndex = items.findIndex((item) =>
        item.toLowerCase().startsWith(searchString)
      );

      return matchIndex >= 0 ? matchIndex : null;
    },

    clear: () => {
      searchString = '';
      if (clearTimeout) {
        globalThis.clearTimeout(clearTimeout);
        clearTimeout = null;
      }
    },
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Check if a key event should activate an element
 */
export function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === Keys.ENTER || event.key === Keys.SPACE;
}

/**
 * Check if event is a navigation key
 */
export function isNavigationKey(event: KeyboardEvent): boolean {
  const navigationKeys = [
    Keys.ARROW_UP,
    Keys.ARROW_DOWN,
    Keys.ARROW_LEFT,
    Keys.ARROW_RIGHT,
    Keys.HOME,
    Keys.END,
  ] as const;
  return (navigationKeys as readonly string[]).includes(event.key);
}

/**
 * Create skip link target
 */
export function createSkipLinkTarget(id: string): void {
  const target = document.getElementById(id);
  if (target && !target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
  }
}
