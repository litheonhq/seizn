/**
 * Focus Trap
 *
 * Traps focus within a container for modals and dialogs.
 *
 * @module lib/a11y/focus-trap
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(',');

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => {
      // Filter out hidden elements
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }
  );
}

/**
 * Create a focus trap for a container
 */
export function createFocusTrap(container: HTMLElement): {
  activate: () => void;
  deactivate: () => void;
  isActive: () => boolean;
} {
  let isActive = false;
  let previouslyFocused: HTMLElement | null = null;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (!container.contains(event.target as Node)) {
      event.preventDefault();
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  };

  return {
    activate: () => {
      if (isActive) return;

      isActive = true;
      previouslyFocused = document.activeElement as HTMLElement;

      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('focusin', handleFocusIn);

      // Focus first focusable element
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    },

    deactivate: () => {
      if (!isActive) return;

      isActive = false;

      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);

      // Restore focus
      if (previouslyFocused) {
        previouslyFocused.focus();
        previouslyFocused = null;
      }
    },

    isActive: () => isActive,
  };
}

/**
 * Auto-focus first focusable element in container
 */
export function autoFocus(container: HTMLElement): HTMLElement | null {
  // First try [autofocus]
  const autofocusElement = container.querySelector<HTMLElement>('[autofocus]');
  if (autofocusElement) {
    autofocusElement.focus();
    return autofocusElement;
  }

  // Then try first focusable
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return focusableElements[0];
  }

  return null;
}

/**
 * Restore focus to previously focused element
 */
export function createFocusRestorer(): {
  save: () => void;
  restore: () => void;
} {
  let savedElement: HTMLElement | null = null;

  return {
    save: () => {
      savedElement = document.activeElement as HTMLElement;
    },
    restore: () => {
      if (savedElement && savedElement.focus) {
        savedElement.focus();
      }
      savedElement = null;
    },
  };
}
